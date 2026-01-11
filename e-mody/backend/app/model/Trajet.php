<?php

require_once __DIR__ . '/BaseModel.php';

class Trajet extends BaseModel
{
    protected string $table = 'trajets';
    protected string $primaryKey = 'id';
    protected bool $timestamps = true;
    protected bool $softDelete = true;
    protected string $deletedAtColumn = 'deleted_at';
    
    // Chemin spécifique vers le certificat CACERT
    protected string $cacertPath = 'C:\wamp64\bin\cacert-2025-11-04.pem';

    public function __construct(PDO $pdo = null)
    {
        parent::__construct($pdo);
        
        // Vérifier que le certificat existe
        if (!file_exists($this->cacertPath)) {
            error_log("ATTENTION: Fichier certificat introuvable: " . $this->cacertPath);
            throw new RuntimeException("Certificat SSL introuvable: " . $this->cacertPath);
        }
        
        error_log("Certificat SSL chargé: " . $this->cacertPath);
    }

    /**
     * Liste tous les trajets avec calcul OSRM garanti
     */
    public function listAll(array $filters = [], array $options = []): array
    {
        $sql = "SELECT t.*, p.nom as employee_nom, p.prenom as employee_prenom, ";
        $sql .= "sa.nom_arret AS start_arret_name, sa.latitude AS start_lat, sa.longitude AS start_lng, ";
        $sql .= "ea.nom_arret AS end_arret_name, ea.latitude AS end_lat, ea.longitude AS end_lng ";
        $sql .= "FROM {$this->table} t ";
        $sql .= "LEFT JOIN personnels p ON p.id = t.id_personnel ";
        $sql .= "LEFT JOIN arrets sa ON sa.id = t.start_arret_id ";
        $sql .= "LEFT JOIN arrets ea ON ea.id = t.end_arret_id ";

        $where = [];
        $params = [];

        if (!empty($filters['employee_id'])) {
            $where[] = 't.id_personnel = :employee_id';
            $params[':employee_id'] = $filters['employee_id'];
        }
        if (!empty($filters['employee_name'])) {
            $where[] = '(p.nom LIKE :ename OR p.prenom LIKE :ename)';
            $params[':ename'] = '%' . $filters['employee_name'] . '%';
        }
        if (!empty($filters['date'])) {
            $where[] = 'DATE(t.start_time) = :date';
            $params[':date'] = $filters['date'];
        }
        if (!empty($filters['status'])) {
            $where[] = 't.status = :status';
            $params[':status'] = $filters['status'];
        }

        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
            if ($this->softDelete) {
                $sql .= ' AND t.' . $this->deletedAtColumn . ' IS NULL';
            }
        } else {
            if ($this->softDelete) {
                $sql .= ' WHERE t.' . $this->deletedAtColumn . ' IS NULL';
            }
        }

        if (!empty($options['order'])) {
            $sql .= ' ORDER BY ' . $options['order'];
        }
        if (!empty($options['limit'])) {
            $sql .= ' LIMIT ' . intval($options['limit']);
        }
        if (!empty($options['offset'])) {
            $sql .= ' OFFSET ' . intval($options['offset']);
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // GARANTIR que tous les trajets ont des données OSRM
        return $this->ensureAllRoutesCalculated($rows);
    }

    /**
     * Garantit que tous les trajets ont des données OSRM calculées
     */
    private function ensureAllRoutesCalculated(array $rows): array
    {
        $updatedRows = [];
        
        foreach ($rows as $row) {
            // Si le trajet n'a pas de données OSRM, les calculer immédiatement
            if (empty($row['distance_km']) || empty($row['path_geojson'])) {
                try {
                    $this->calculateAndSaveRouteData($row['id']);
                    // Recharger la ligne mise à jour
                    $updatedRow = $this->findWithDetails($row['id']);
                    if ($updatedRow) {
                        $updatedRows[] = $updatedRow;
                        continue;
                    }
                } catch (Exception $e) {
                    error_log("Erreur calcul route trajet {$row['id']}: " . $e->getMessage());
                }
            }
            $updatedRows[] = $row;
        }
        
        return $updatedRows;
    }

    public function findWithDetails(int $id): ?array
    {
        $sql = "SELECT t.*, p.nom as employee_nom, p.prenom as employee_prenom, ";
        $sql .= "sa.nom_arret AS start_arret_name, sa.latitude AS start_lat, sa.longitude AS start_lng, ";
        $sql .= "ea.nom_arret AS end_arret_name, ea.latitude AS end_lat, ea.longitude AS end_lng ";
        $sql .= "FROM {$this->table} t ";
        $sql .= "LEFT JOIN personnels p ON p.id = t.id_personnel ";
        $sql .= "LEFT JOIN arrets sa ON sa.id = t.start_arret_id ";
        $sql .= "LEFT JOIN arrets ea ON ea.id = t.end_arret_id ";
        $sql .= " WHERE t.{$this->primaryKey} = :id ";
        if ($this->softDelete) $sql .= " AND t.{$this->deletedAtColumn} IS NULL";

        $stmt = $this->db->prepare($sql);
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($row && (empty($row['distance_km']) || empty($row['path_geojson']))) {
            $this->calculateAndSaveRouteData($id);
            // Recharger après calcul
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        
        return $row ?: null;
    }

    /**
     * Crée un trajet avec calcul OSRM FORCÉ
     */
    public function createFromForm(array $form): int
    {
        // Validation
        if (empty($form['employee_id']) && empty($form['employee_name'])) {
            throw new InvalidArgumentException('Employé requis (employee_id ou employee_name)');
        }
        if (empty($form['start_arret_id']) && (empty($form['start_lat']) || empty($form['start_lng'])) && empty($form['start_address'])) {
            throw new InvalidArgumentException('Point de départ requis');
        }
        if (empty($form['end_arret_id']) && (empty($form['end_lat']) || empty($form['end_lng'])) && empty($form['end_address'])) {
            throw new InvalidArgumentException('Destination requise');
        }

        // Résolution employé
        $employeeId = $this->resolveEmployee($form);
        
        // Résolution points
        $start = $this->resolvePoint($form, 'start');
        $end = $this->resolvePoint($form, 'end');

        // Calcul OSRM IMMÉDIAT
        $route = $this->getRouteFromOsrm($start['lat'], $start['lng'], $end['lat'], $end['lng']);

        $data = [
            'id_personnel' => $employeeId,
            'start_arret_id' => $form['start_arret_id'] ?? null,
            'end_arret_id' => $form['end_arret_id'] ?? null,
            'start_address' => $form['start_address'] ?? $start['label'] ?? null,
            'end_address' => $form['end_address'] ?? $end['label'] ?? null,
            'start_lat' => $start['lat'],
            'start_lng' => $start['lng'],
            'end_lat' => $end['lat'],
            'end_lng' => $end['lng'],
            'start_time' => $form['start_time'] ?? null,
            'end_time' => $form['end_time'] ?? null,
            'purpose' => $form['purpose'] ?? null,
            'status' => $form['status'] ?? 'planned',
            'distance_km' => $route['distance_km'],
            'duration_min' => $route['duration_min'],
            'path_geojson' => json_encode($route['geojson']),
        ];

        try {
            $insertId = $this->create($data);
            
            // VÉRIFICATION que les données sont bien enregistrées
            $this->verifyOsrmData($insertId);
            
            return $insertId;
            
        } catch (PDOException $e) {
            if ($e->getCode() === '42S02') {
                throw new RuntimeException(
                    "Table 'trajets' introuvable. Créez la table avant d'insérer.\n" .
                    "CREATE TABLE trajets ( id INT AUTO_INCREMENT PRIMARY KEY, id_personnel INT, start_arret_id INT, end_arret_id INT, start_address TEXT, end_address TEXT, start_lat DOUBLE, start_lng DOUBLE, end_lat DOUBLE, end_lng DOUBLE, start_time DATETIME, end_time DATETIME, purpose VARCHAR(255), status VARCHAR(50), distance_km DOUBLE, duration_min INT, path_geojson JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, deleted_at TIMESTAMP NULL );"
                );
            }
            throw $e;
        }
    }

    /**
     * Résout l'employé à partir du formulaire
     */
    private function resolveEmployee(array $form): int
    {
        $employeeId = $form['employee_id'] ?? null;
        if (!$employeeId && !empty($form['employee_name'])) {
            $name = $form['employee_name'];
            $stmt = $this->db->prepare("SELECT id FROM personnels WHERE CONCAT(nom, ' ', prenom) = :fullname LIMIT 1");
            $stmt->execute([':fullname' => $name]);
            $employeeId = $stmt->fetchColumn();
            if (!$employeeId) {
                $stmt = $this->db->prepare("SELECT id FROM personnels WHERE nom LIKE :n OR prenom LIKE :n LIMIT 1");
                $stmt->execute([':n' => '%' . $name . '%']);
                $employeeId = $stmt->fetchColumn();
            }
            if (!$employeeId) {
                throw new RuntimeException('Employé introuvable pour "' . $name . '"');
            }
        }
        return (int)$employeeId;
    }

    /**
     * Calcule et sauvegarde les données de route pour un trajet existant
     */
    private function calculateAndSaveRouteData(int $trajetId): bool
    {
        $trajet = $this->find($trajetId);
        if (!$trajet) {
            throw new RuntimeException("Trajet $trajetId introuvable");
        }

        if (empty($trajet['start_lat']) || empty($trajet['start_lng']) || empty($trajet['end_lat']) || empty($trajet['end_lng'])) {
            throw new RuntimeException("Trajet $trajetId n'a pas de coordonnées valides");
        }

        $route = $this->getRouteFromOsrm(
            (float)$trajet['start_lat'], 
            (float)$trajet['start_lng'], 
            (float)$trajet['end_lat'], 
            (float)$trajet['end_lng']
        );

        $data = [
            'distance_km' => $route['distance_km'],
            'duration_min' => $route['duration_min'],
            'path_geojson' => json_encode($route['geojson']),
        ];

        return $this->update($trajetId, $data);
    }

    /**
     * Vérifie que les données OSRM sont bien enregistrées
     */
    private function verifyOsrmData(int $trajetId): void
    {
        $stmt = $this->db->prepare("SELECT distance_km, duration_min, path_geojson FROM trajets WHERE id = ?");
        $stmt->execute([$trajetId]);
        $data = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (empty($data['distance_km']) || empty($data['path_geojson'])) {
            error_log("ATTENTION: Trajet $trajetId créé sans données OSRM complètes");
            // Tentative de récupération
            $this->calculateAndSaveRouteData($trajetId);
        }
    }

    /**
     * MÉTHODE UNIVERSELLE : Met à jour TOUS les trajets sans données OSRM
     */
    public function migrateAllTrajets(): array
    {
        // 1. D'abord, s'assurer que tous les trajets ont des coordonnées
        $this->fillMissingCoordinates();
        
        // 2. Ensuite, calculer les routes pour tous les trajets manquants
        $sql = "SELECT id FROM {$this->table} WHERE (distance_km IS NULL OR path_geojson IS NULL)";
        if ($this->softDelete) {
            $sql .= " AND {$this->deletedAtColumn} IS NULL";
        }
        
        $stmt = $this->db->query($sql);
        $trajets = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $results = [
            'total' => count($trajets),
            'success' => 0,
            'errors' => []
        ];
        
        foreach ($trajets as $trajet) {
            try {
                if ($this->calculateAndSaveRouteData((int)$trajet['id'])) {
                    $results['success']++;
                }
                usleep(200000); // 200ms pause pour OSRM
            } catch (Exception $e) {
                $results['errors'][] = "Trajet {$trajet['id']}: " . $e->getMessage();
            }
        }
        
        return $results;
    }

    
    /**
     * Remplit les coordonnées manquantes à partir des arrêts
     */
    private function fillMissingCoordinates(): int
    {
        $sql = "UPDATE {$this->table} t 
                LEFT JOIN arrets sa ON t.start_arret_id = sa.id 
                LEFT JOIN arrets ea ON t.end_arret_id = ea.id 
                SET t.start_lat = sa.latitude, t.start_lng = sa.longitude, 
                    t.end_lat = ea.latitude, t.end_lng = ea.longitude 
                WHERE (t.start_lat IS NULL OR t.end_lat IS NULL) 
                AND (sa.latitude IS NOT NULL AND ea.latitude IS NOT NULL)";
        
        return $this->db->exec($sql);
    }

    /**
     * Résout un point (départ ou arrivée)
     */
    protected function resolvePoint(array $form, string $which): array
    {
        $keyArret = $which . '_arret_id';
        $keyLat = $which . '_lat';
        $keyLng = $which . '_lng';
        $keyAddress = $which . '_address';

        // Arrêt spécifié
        if (!empty($form[$keyArret])) {
            $stmt = $this->db->prepare('SELECT latitude, longitude, nom_arret FROM arrets WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $form[$keyArret]]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) throw new RuntimeException(ucfirst($which) . ' arret introuvable');
            return [
                'lat' => (float)$row['latitude'], 
                'lng' => (float)$row['longitude'], 
                'label' => $row['nom_arret'] ?? null
            ];
        }

        // Coordonnées directes
        if (!empty($form[$keyLat]) && !empty($form[$keyLng])) {
            return [
                'lat' => (float)$form[$keyLat], 
                'lng' => (float)$form[$keyLng], 
                'label' => $form[$keyAddress] ?? null
            ];
        }

        // Adresse à géocoder
        if (!empty($form[$keyAddress])) {
            $g = $this->geocodeAddress($form[$keyAddress]);
            if (!$g) throw new RuntimeException('Impossible de géocoder l\'adresse: ' . $form[$keyAddress]);
            return [
                'lat' => $g['lat'], 
                'lng' => $g['lng'], 
                'label' => $form[$keyAddress]
            ];
        }

        throw new InvalidArgumentException('Point ' . $which . ' non résolu');
    }

    /**
     * CALCUL OSRM avec fallback garanti et gestion SSL
     */
    public function getRouteFromOsrm(float $lat1, float $lng1, float $lat2, float $lng2, int $maxRetries = 3): array
    {
        $profile = 'driving';
        $coords = sprintf('%F,%F;%F,%F', $lng1, $lat1, $lng2, $lat2);
        $url = "https://router.project-osrm.org/route/v1/{$profile}/{$coords}?overview=full&geometries=geojson&steps=false";

        $retryCount = 0;
        
        while ($retryCount <= $maxRetries) {
            try {
                $res = $this->httpGet($url);
                $json = json_decode($res, true);

                if (empty($json) || $json['code'] !== 'Ok' || !isset($json['routes'][0])) {
                    throw new RuntimeException("Réponse OSRM invalide: " . substr($res, 0, 200));
                }

                $route = $json['routes'][0];
                $distanceKm = isset($route['distance']) ? round($route['distance'] / 1000, 3) : null;
                $durationMin = isset($route['duration']) ? (int)round($route['duration'] / 60) : null;

                $geojson = $route['geometry'];
                $path = [];
                if (isset($geojson['coordinates']) && is_array($geojson['coordinates'])) {
                    foreach ($geojson['coordinates'] as $pt) {
                        $path[] = [(float)$pt[1], (float)$pt[0]];
                    }
                }

                return [
                    'distance_km' => $distanceKm,
                    'duration_min' => $durationMin,
                    'geojson' => $geojson,
                    'coords' => $path,
                    'fallback' => false
                ];
                
            } catch (Throwable $e) {
                $retryCount++;
                if ($retryCount > $maxRetries) {
                    error_log("OSRM échoué après {$maxRetries} tentatives: " . $e->getMessage());
                    return $this->createFallbackRoute($lat1, $lng1, $lat2, $lng2, $e->getMessage());
                }
                
                // Attendre avant de réessayer
                usleep(500000 * $retryCount); // 0.5s, 1s, etc.
                error_log("Tentative OSRM {$retryCount} échouée, nouvelle tentative...");
            }
        }
        
        return $this->createFallbackRoute($lat1, $lng1, $lat2, $lng2, 'Toutes les tentatives ont échoué');
    }

    /**
     * REQUÊTE HTTP AVEC CERTIFICAT SSL
     */
    private function httpGet(string $url, array $headers = []): string
    {
        $ch = curl_init();
        
        $curlOptions = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERAGENT => 'TrajetModel/1.0',
            CURLOPT_HTTPHEADER => array_merge([
                'Accept: application/json',
                'Content-Type: application/json'
            ], $headers),
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            
            // Configuration SSL avec le certificat spécifique
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CAINFO => $this->cacertPath,
        ];

        curl_setopt_array($ch, $curlOptions);

        $res = curl_exec($ch);
        $err = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $sslVerify = curl_getinfo($ch, CURLINFO_SSL_VERIFYRESULT);
        
        curl_close($ch);

        if ($sslVerify !== 0) {
            throw new RuntimeException("Échec vérification SSL (code: {$sslVerify}) pour: " . $url);
        }

        if ($res === false) {
            throw new RuntimeException("HTTP request failed: " . $err . " [URL: " . $url . "]");
        }
        
        if ($httpCode !== 200) {
            throw new RuntimeException("HTTP error {$httpCode}: " . substr($res, 0, 200) . " [URL: " . $url . "]");
        }

        return $res;
    }

    /**
     * Route de fallback avec Haversine
     */
    private function createFallbackRoute(float $lat1, float $lng1, float $lat2, float $lng2, string $error = ''): array
    {
        $distanceKm = $this->calculateHaversineDistance($lat1, $lng1, $lat2, $lng2);
        $durationMin = max(5, (int)round($distanceKm * 2.5));
        
        return [
            'distance_km' => $distanceKm,
            'duration_min' => $durationMin,
            'geojson' => [
                'type' => 'LineString',
                'coordinates' => [[$lng1, $lat1], [$lng2, $lat2]]
            ],
            'coords' => [[$lat1, $lng1], [$lat2, $lng2]],
            'fallback' => true,
            'error' => $error
        ];
    }

    private function calculateHaversineDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat/2) * sin($dLat/2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng/2) * sin($dLng/2);
        $c = 2 * atan2(sqrt($a), sqrt(1-$a));
        return round($earthRadius * $c, 3);
    }

    private function geocodeAddress(string $address): ?array
    {
        $q = http_build_query(['q' => $address, 'format' => 'json', 'limit' => 1]);
        $url = "https://nominatim.openstreetmap.org/search?{$q}";

        try {
            $res = $this->httpGet($url, ["Accept-Language: fr"]);
            $json = json_decode($res, true);
            return empty($json) ? null : ['lat' => (float)$json[0]['lat'], 'lng' => (float)$json[0]['lon']];
        } catch (RuntimeException $e) {
            error_log("Géocodage échoué pour: {$address} - " . $e->getMessage());
            return null;
        }
    }

    public function formatForFrontend(array $dbRow): array
    {
        $employee = trim(($dbRow['employee_nom'] ?? '') . ' ' . ($dbRow['employee_prenom'] ?? '')) ?: null;

        $start = ['lat' => (float)($dbRow['start_lat'] ?? 0), 'lng' => (float)($dbRow['start_lng'] ?? 0)];
        $end = ['lat' => (float)($dbRow['end_lat'] ?? 0), 'lng' => (float)($dbRow['end_lng'] ?? 0)];

        $path = [];
        $isFallback = false;
        
        if (!empty($dbRow['path_geojson'])) {
            $g = json_decode($dbRow['path_geojson'], true);
            if (!empty($g['coordinates'])) {
                foreach ($g['coordinates'] as $pt) {
                    $path[] = [(float)$pt[1], (float)$pt[0]];
                }
                $isFallback = (count($path) <= 2);
            }
        }

        if (empty($path)) {
            $path = [[$start['lat'], $start['lng']], [$end['lat'], $end['lng']]];
            $isFallback = true;
        }

        return [
            'id' => $dbRow['id'],
            'employee' => $employee,
            'startLocation' => $dbRow['start_address'] ?? $dbRow['start_arret_name'] ?? 'Point de départ',
            'endLocation' => $dbRow['end_address'] ?? $dbRow['end_arret_name'] ?? 'Destination',
            'startTime' => isset($dbRow['start_time']) ? substr($dbRow['start_time'], 11, 5) : ($dbRow['start_time'] ?? null),
            'endTime' => isset($dbRow['end_time']) ? substr($dbRow['end_time'], 11, 5) : ($dbRow['end_time'] ?? null),
            'distance' => isset($dbRow['distance_km']) ? (float)$dbRow['distance_km'] : null,
            'duration' => isset($dbRow['duration_min']) ? (int)$dbRow['duration_min'] : null,
            'status' => $dbRow['status'] ?? null,
            'purpose' => $dbRow['purpose'] ?? null,
            'isFallbackRoute' => $isFallback,
            'coordinates' => [
                'start' => [$start['lat'], $start['lng']],
                'end' => [$end['lat'], $end['lng']],
                'path' => $path,
            ],
        ];
    }

    /**
     * MÉTHODE SPÉCIALE POUR LES TRAJETS DU JOUR avec OSRM prioritaire
     */
    public function getTodayTripsWithGuaranteedOsrm(): array
    {
        $today = date('Y-m-d');
        $filters = ['date' => $today];
        $options = ['order' => 'start_time ASC'];
        
        $trips = $this->listAll($filters, $options);
        
        // Forcer le recalcul OSRM pour tous les trajets du jour
        foreach ($trips as &$trip) {
            if (empty($trip['distance_km']) || empty($trip['path_geojson']) || $this->isRouteFallback($trip)) {
                try {
                    $this->calculateAndSaveRouteData($trip['id']);
                    // Recharger les données
                    $updated = $this->findWithDetails($trip['id']);
                    if ($updated) {
                        $trip = $updated;
                    }
                } catch (Exception $e) {
                    error_log("Erreur OSRM pour trajet {$trip['id']}: " . $e->getMessage());
                }
            }
        }
        
        return $trips;
    }

    /**
     * Vérifie si un trajet utilise une route fallback
     */
    private function isRouteFallback(array $trip): bool
    {
        if (empty($trip['path_geojson'])) {
            return true;
        }
        
        $geojson = json_decode($trip['path_geojson'], true);
        if (!isset($geojson['coordinates'])) {
            return true;
        }
        
        // Si moins de 3 points, c'est probablement une route fallback
        return count($geojson['coordinates']) <= 2;
    }

    /**
     * MÉTHODE MIGRATION : À exécuter une fois pour corriger tous les trajets existants
     */
    public function executeMigration(): array
    {
        $results = [];
        
        // 1. Migration des trajets existants
        $results['migration'] = $this->migrateAllTrajets();
        
        // 2. Vérification finale
        $checkStmt = $this->db->query("
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN distance_km IS NOT NULL AND path_geojson IS NOT NULL THEN 1 ELSE 0 END) as with_osrm,
                SUM(CASE WHEN distance_km IS NULL OR path_geojson IS NULL THEN 1 ELSE 0 END) as without_osrm
            FROM trajets 
            WHERE deleted_at IS NULL
        ");
        $results['verification'] = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        return $results;
    }

    /**
     * TEST de connexion OSRM
     */
    public function testOsrmConnection(): array
    {
        $testCoords = [
            'start' => ['lat' => 48.8566, 'lng' => 2.3522], // Paris
            'end' => ['lat' => 49.2583, 'lng' => 4.0317] // Reims
        ];
        
        try {
            $route = $this->getRouteFromOsrm(
                $testCoords['start']['lat'],
                $testCoords['start']['lng'],
                $testCoords['end']['lat'],
                $testCoords['end']['lng']
            );
            
            return [
                'success' => true,
                'fallback' => $route['fallback'],
                'distance_km' => $route['distance_km'],
                'duration_min' => $route['duration_min'],
                'coordinates_count' => count($route['coords']),
                'certificate_path' => $this->cacertPath,
                'certificate_exists' => file_exists($this->cacertPath)
            ];
            
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'certificate_path' => $this->cacertPath,
                'certificate_exists' => file_exists($this->cacertPath)
            ];
        }
    }
}