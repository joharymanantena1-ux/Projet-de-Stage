<?php

require_once __DIR__ . '/BaseModel.php';

class Assignment extends BaseModel
{
    protected string $table = 'assignments';
    protected bool $timestamps = true;

    public function getPlannedPersonnelByDateAndTime(string $date, string $heure_sortie): array
    {
        $sql = "
            SELECT
                pp.heure_sortie AS heure_sortie,
                ax.nom_axe AS nom_axe,
                a.nom_arret AS nom_arret,
                a.ordre AS ordre_arret,
                p.matricule AS matricule,
                CONCAT(p.nom, ' ', p.prenom) AS nom_complet,
                p.fonction AS fonction,
                p.latitude AS personnel_lat,
                p.longitude AS personnel_lng,
                a.latitude AS arret_lat,
                a.longitude AS arret_lng,
                a.id AS arret_id,
                ax.id AS axe_id
            FROM personnels p
            INNER JOIN planning_personnel pp ON p.id = pp.id_personnel
            LEFT JOIN arrets a ON p.id_arret = a.id
            LEFT JOIN axes ax ON a.id_axe = ax.id
            WHERE p.planifier = 1
            AND pp.date_jour = :date_jour
            AND pp.heure_sortie = :heure_sortie
            ORDER BY ax.nom_axe ASC, a.ordre ASC, p.nom ASC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            ':date_jour' => $date,
            ':heure_sortie' => $heure_sortie
        ]);

        $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        return $this->applyNearestStopLogic($results);
    }
    private function applyNearestStopLogic(array $personnels): array
    {
        $groupedByAxe = [];

        foreach ($personnels as $personnel) {
            $axeId = $personnel['axe_id'] ?? null;
            $key = is_null($axeId) ? 'null' : (string)$axeId;
            if (!isset($groupedByAxe[$key])) {
                $groupedByAxe[$key] = [
                    'axe_id' => $axeId,
                    'personnels' => []
                ];
            }
            $groupedByAxe[$key]['personnels'][] = $personnel;
        }

        $processedResults = [];

        foreach ($groupedByAxe as $group) {
            $axeId = $group['axe_id'];
            $axePersonnels = $group['personnels'];

            $hasOrder = $this->hasOrderInAxe($axePersonnels);

            if ($hasOrder && !is_null($axeId)) {
                $processed = $this->processWithOrderFromDeparture($axePersonnels, (int)$axeId);
                $processedResults = array_merge($processedResults, $processed);
            } else {
                $processed = $this->processWithNearestStop($axePersonnels);
                $processedResults = array_merge($processedResults, $processed);
            }
        }

        return $processedResults;
    }

    private function hasOrderInAxe(array $personnels): bool
    {
        foreach ($personnels as $personnel) {
            if (isset($personnel['ordre_arret']) && $personnel['ordre_arret'] !== '' && !is_null($personnel['ordre_arret']) && $personnel['ordre_arret'] > 0) {
                return true;
            }
        }
        return false;
    }

    private function processWithOrderFromDeparture(array $personnels, int $axeId): array
    {
        $departure = $this->getAxeDeparture($axeId);

        if ($departure === null) {
            return $this->processWithOrder($personnels);
        }

        $departureLat = (float)$departure['lat'];
        $departureLng = (float)$departure['lng'];

        $stops = $this->getAllStopsForAxe($axeId);
        if (empty($stops)) {
            usort($personnels, function($a, $b) {
                return strcmp($a['nom_complet'] ?? '', $b['nom_complet'] ?? '');
            });
            return $personnels;
        }

        usort($stops, function($a, $b) use ($departureLat, $departureLng) {
            $da = $this->calculateHaversineDistance($departureLat, $departureLng, (float)$a['latitude'], (float)$a['longitude']);
            $db = $this->calculateHaversineDistance($departureLat, $departureLng, (float)$b['latitude'], (float)$b['longitude']);
            return $da <=> $db;
        });

        // Map stopId => stop
        $stopsById = [];
        foreach ($stops as $s) {
            $stopsById[$s['id']] = $s;
        }

        // Grouper personnels par arret_id si existant ; sinon affecter au nearest si coords valides
        $groupedPersonnelByStop = [];
        $unassigned = [];

        foreach ($personnels as $p) {
            $arretId = $p['arret_id'] ?? null;
            if ($arretId && isset($stopsById[$arretId])) {
                $groupedPersonnelByStop[$arretId][] = $p;
                continue;
            }

            // Si pas d'arret affecté mais on a coords, trouver le stop le plus proche
            if ($this->hasValidCoordinates($p)) {
                $nearest = $this->findNearestStop((float)$p['personnel_lat'], (float)$p['personnel_lng'], $stops);
                if ($nearest) {
                    $p['nom_arret'] = $nearest['nom_arret'];
                    $p['arret_lat'] = $nearest['latitude'];
                    $p['arret_lng'] = $nearest['longitude'];
                    $p['arret_id'] = $nearest['id'];
                    $p['ordre_arret'] = $nearest['ordre'] ?? null;
                    $p['distance_km'] = $nearest['distance'];
                    $p['optimized'] = true;
                    $groupedPersonnelByStop[$nearest['id']][] = $p;
                    continue;
                }
            }

            // Cas : pas de coords valides ou aucun arrêt trouvé -> non optimisé, ajout à la fin
            $p['optimized'] = false;
            $p['distance_km'] = null;
            $unassigned[] = $p;
        }

        // Construire la liste finale en parcourant les arrêts triés par distance depuis le départ
        $final = [];
        foreach ($stops as $stop) {
            $sid = $stop['id'];
            if (isset($groupedPersonnelByStop[$sid])) {
                // Tri interne optionnel : par nom_complet
                usort($groupedPersonnelByStop[$sid], function($a, $b) {
                    return strcmp($a['nom_complet'] ?? '', $b['nom_complet'] ?? '');
                });
                $final = array_merge($final, $groupedPersonnelByStop[$sid]);
            }
        }

        // Ajouter les personnels non affectés en fin
        $final = array_merge($final, $unassigned);

        return $final;
    }
    
    private function processWithOrder(array $personnels): array
    {
        usort($personnels, function($a, $b) {
            $orderA = isset($a['ordre_arret']) && $a['ordre_arret'] !== '' && !is_null($a['ordre_arret']) ? (int)$a['ordre_arret'] : PHP_INT_MAX;
            $orderB = isset($b['ordre_arret']) && $b['ordre_arret'] !== '' && !is_null($b['ordre_arret']) ? (int)$b['ordre_arret'] : PHP_INT_MAX;
            if ($orderA === $orderB) {
                return strcmp($a['nom_complet'] ?? '', $b['nom_complet'] ?? '');
            }
            return $orderA <=> $orderB;
        });

        return $personnels;
    }

    private function processWithNearestStop(array $personnels): array
    {
        if (count($personnels) <= 1) {
            return $personnels;
        }

        $axeId = $personnels[0]['axe_id'] ?? null;
        if (is_null($axeId)) {
            usort($personnels, function($a, $b) {
                return strcmp($a['nom_complet'] ?? '', $b['nom_complet'] ?? '');
            });
            return $personnels;
        }

        // Récupérer tous les arrêts de l'axe
        $allStops = $this->getAllStopsForAxe((int)$axeId);

        if (empty($allStops)) {
            return $personnels;
        }

        $optimizedPersonnels = [];
        $personnelsWithCoords = [];
        $personnelsWithoutCoords = [];

        // Séparer les personnels avec et sans coordonnées GPS
        foreach ($personnels as $personnel) {
            if ($this->hasValidCoordinates($personnel)) {
                $personnelsWithCoords[] = $personnel;
            } else {
                $personnelsWithoutCoords[] = $personnel;
            }
        }

        // Traiter d'abord les personnels avec coordonnées GPS
        foreach ($personnelsWithCoords as $personnel) {
            $nearestStop = $this->findNearestStop(
                (float)$personnel['personnel_lat'],
                (float)$personnel['personnel_lng'],
                $allStops
            );

            if ($nearestStop) {
                // Mettre à jour les informations de l'arrêt avec l'arrêt le plus proche
                $personnel['nom_arret'] = $nearestStop['nom_arret'];
                $personnel['arret_lat'] = $nearestStop['latitude'];
                $personnel['arret_lng'] = $nearestStop['longitude'];
                $personnel['arret_id'] = $nearestStop['id'];
                $personnel['ordre_arret'] = $nearestStop['ordre'];
                $personnel['distance_km'] = $nearestStop['distance'];
                $personnel['optimized'] = true;
            }

            $optimizedPersonnels[] = $personnel;
        }

        // Ajouter les personnels sans coordonnées GPS (non optimisés)
        foreach ($personnelsWithoutCoords as $personnel) {
            $personnel['optimized'] = false;
            $personnel['distance_km'] = null;
            $optimizedPersonnels[] = $personnel;
        }

        // Trier par distance croissante (ceux sans distance à la fin)
        usort($optimizedPersonnels, function($a, $b) {
            $distA = $a['distance_km'] ?? PHP_FLOAT_MAX;
            $distB = $b['distance_km'] ?? PHP_FLOAT_MAX;
            if ($distA === $distB) {
                return strcmp($a['nom_complet'] ?? '', $b['nom_complet'] ?? '');
            }
            return $distA <=> $distB;
        });

        return $optimizedPersonnels;
    }

    private function hasValidCoordinates(array $personnel): bool
    {
        if (!isset($personnel['personnel_lat'], $personnel['personnel_lng'])) {
            return false;
        }

        if ($personnel['personnel_lat'] === '' || $personnel['personnel_lng'] === '') {
            return false;
        }

        if (!is_numeric($personnel['personnel_lat']) || !is_numeric($personnel['personnel_lng'])) {
            return false;
        }

        $lat = (float)$personnel['personnel_lat'];
        $lng = (float)$personnel['personnel_lng'];

        // Considérer 0,0 comme invalide s'il s'agit d'un placeholder — si tu veux accepter 0,0, ajuste ici.
        if ($lat === 0.0 && $lng === 0.0) {
            return false;
        }

        return abs($lat) <= 90.0 && abs($lng) <= 180.0;
    }

    private function getAllStopsForAxe(int $axeId): array
    {
        $sql = "SELECT id, nom_arret, latitude, longitude, ordre 
                FROM arrets 
                WHERE id_axe = :axe_id 
                ORDER BY ordre ASC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute([':axe_id' => $axeId]);

        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    private function findNearestStop(float $personnelLat, float $personnelLng, array $stops): ?array
    {
        $nearestStop = null;
        $minDistance = PHP_FLOAT_MAX;

        foreach ($stops as $stop) {
            if (!isset($stop['latitude'], $stop['longitude'])) {
                continue;
            }
            if ($stop['latitude'] === '' || $stop['longitude'] === '') {
                continue;
            }
            if (!is_numeric($stop['latitude']) || !is_numeric($stop['longitude'])) {
                continue;
            }

            $stopLat = (float)$stop['latitude'];
            $stopLng = (float)$stop['longitude'];

            // Filtrer points invalides / placeholder
            if ($stopLat === 0.0 && $stopLng === 0.0) {
                continue;
            }

            $distance = $this->calculateHaversineDistance(
                $personnelLat,
                $personnelLng,
                $stopLat,
                $stopLng
            );

            if ($distance < $minDistance) {
                $minDistance = $distance;
                $nearestStop = $stop;
                $nearestStop['distance'] = $distance;
            }
        }

        return $nearestStop;
    }

    private function calculateHaversineDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371.0; 

        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLng / 2) * sin($dLng / 2);

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }

    private function getAxeDeparture(int $axeId): ?array
    {
        // Récupérer la chaine point_depart
        $sql = "SELECT point_depart FROM axes WHERE id = :id LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':id' => $axeId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($row && !empty($row['point_depart'])) {
            $parsed = $this->parsePointDepartString($row['point_depart']);
            if ($parsed !== null) {
                return $parsed; // ['lat'=>..., 'lng'=>...]
            }
        }

        // Fallback : utiliser le premier arrêt (ordre minimal)
        $firstStop = $this->getFirstStopForAxe($axeId);
        if ($firstStop) {
            // Assurer la validité
            if (isset($firstStop['latitude'], $firstStop['longitude']) && is_numeric($firstStop['latitude']) && is_numeric($firstStop['longitude'])) {
                return [
                    'lat' => (float)$firstStop['latitude'],
                    'lng' => (float)$firstStop['longitude']
                ];
            }
        }

        return null;
    }

    private function parsePointDepartString(string $s): ?array
    {
        $s = trim($s);
        if ($s === '') return null;

        // split sur , ; ou espace(s)
        $parts = preg_split('/[,\;\s]+/', $s);
        if (!$parts || count($parts) < 2) return null;

        $a = filter_var($parts[0], FILTER_VALIDATE_FLOAT);
        $b = filter_var($parts[1], FILTER_VALIDATE_FLOAT);
        if ($a === false || $b === false) return null;

        $a = (float)$a; $b = (float)$b;

        // Si premier est dans plage lat et second dans plage lng -> lat,a lng,b
        if (abs($a) <= 90 && abs($b) <= 180) {
            return ['lat' => $a, 'lng' => $b];
        }
        // Sinon si second est lat possible (donc format lng,lat)
        if (abs($b) <= 90 && abs($a) <= 180) {
            return ['lat' => $b, 'lng' => $a];
        }

        // ambiguous / invalide
        return null;
    }

    private function getFirstStopForAxe(int $axeId): ?array
    {
        $sql = "SELECT id, nom_arret, latitude, longitude, ordre
                FROM arrets
                WHERE id_axe = :axe_id
                ORDER BY ordre ASC
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':axe_id' => $axeId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ? $row : null;
    }

    public function getWithDetails(array $conditions = [], array $options = []): array
    {
        $sql = "SELECT 
                    a.*,
                    c.nom_car,
                    ar.nom_arret,
                    p.nom as personnel_nom,
                    p.prenom as personnel_prenom,
                    p.fonction as personnel_fonction
                FROM {$this->table} a
                LEFT JOIN cars c ON a.id_car = c.id
                LEFT JOIN arrets ar ON a.id_arret = ar.id
                LEFT JOIN personnels p ON a.id_personnel = p.id";

        $where = '';
        $params = [];

        if (!empty($conditions)) {
            $whereParts = [];
            foreach ($conditions as $key => $value) {
                if (is_int($key)) {
                    $whereParts[] = $value;
                } else {
                    $whereParts[] = "$key = ?";
                    $params[] = $value;
                }
            }
            $where = ' WHERE ' . implode(' AND ', $whereParts);
        }

        $sql .= $where;

        // Gestion du ORDER BY
        if (isset($options['order'])) {
            $sql .= " ORDER BY " . $options['order'];
        } else {
            $sql .= " ORDER BY a.date_assignment DESC, a.assigned_at DESC";
        }

        // Gestion de LIMIT et OFFSET
        if (isset($options['limit'])) {
            $sql .= " LIMIT " . (int)$options['limit'];
            if (isset($options['offset'])) {
                $sql .= " OFFSET " . (int)$options['offset'];
            }
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function assignmentExists(int $carId, int $personnelId, string $date): bool
    {
        $sql = "SELECT COUNT(*) FROM {$this->table} 
                WHERE id_car = ? AND id_personnel = ? AND date_assignment = ?";
        
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$carId, $personnelId, $date]);
        
        return $stmt->fetchColumn() > 0;
    }

    public function getByDate(string $date): array
    {
        return $this->getWithDetails(['a.date_assignment = ?'], ['order' => 'a.assigned_at ASC'], [$date]);
    }

    public function getByPersonnel(int $personnelId, string $startDate, string $endDate): array
    {
        $sql = "SELECT a.*, c.nom_car, ar.nom_arret 
                FROM {$this->table} a
                LEFT JOIN cars c ON a.id_car = c.id
                LEFT JOIN arrets ar ON a.id_arret = ar.id
                WHERE a.id_personnel = ? AND a.date_assignment BETWEEN ? AND ?
                ORDER BY a.date_assignment ASC";
        
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$personnelId, $startDate, $endDate]);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

}
