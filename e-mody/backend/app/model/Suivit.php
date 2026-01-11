<?php
require_once __DIR__ . '/BaseModel.php';

class Suivit extends BaseModel
{
    protected string $table = 'planning_personnel';
    protected bool $timestamps = true;

    public function __construct()
    {
        parent::__construct();
        $this->createSuiviTableIfNotExists();
    }

    public function getDailyData(string $date): array
    {
        try {
            $sql = "SELECT 
                        date,
                        shift,
                        commander,
                        comptageFiche,
                        ecart
                    FROM vue_suivi_quotidien
                    WHERE date = ?
                    ORDER BY shift ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$date]);
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
            
        } catch (Exception $e) {
            error_log("Erreur getDailyData: " . $e->getMessage());
            throw new Exception("Erreur lors de la récupération des données quotidiennes: " . $e->getMessage());
        }
    }

    public function getMonthlyData(string $startDate, string $endDate): array
    {
        try {
            $sql = "SELECT 
                    date,
                    shift,
                    commander,
                    comptageFiche,
                    ecart
                FROM vue_suivi_quotidien
                WHERE date BETWEEN ? AND ?
                ORDER BY date ASC, shift ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$startDate, $endDate]);
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            error_log("Erreur getMonthlyData: " . $e->getMessage());
            throw new Exception("Erreur lors de la récupération des données mensuelles: " . $e->getMessage());
        }
    }

    public function getWeeklySummary(string $startDate, string $endDate): array
    {
        try {
            $sql = "SELECT 
                    week,
                    totalCommander,
                    totalComptageFiche,
                    totalEcart
                FROM vue_suivi_hebdomadaire
                WHERE date BETWEEN ? AND ?
                GROUP BY week, totalCommander, totalComptageFiche, totalEcart
                ORDER BY MIN(date) ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$startDate, $endDate]);
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            error_log("Erreur getWeeklySummary: " . $e->getMessage());
            return $this->getWeeklySummaryFallback($startDate, $endDate);
        }
    }

    private function getWeeklySummaryFallback(string $startDate, string $endDate): array
    {
        $sql = "SELECT 
                    CONCAT('S', WEEK(pp.date_jour, 1), ' (', 
                           DATE_FORMAT(DATE_ADD(pp.date_jour, INTERVAL -WEEKDAY(pp.date_jour) DAY), '%d/%m'),
                           ' - ',
                           DATE_FORMAT(DATE_ADD(pp.date_jour, INTERVAL (6 - WEEKDAY(pp.date_jour)) DAY), '%d/%m'),
                           ')') AS week,
                    COUNT(DISTINCT p.id) AS totalCommander,
                    COALESCE(SUM(st.comptage_fiche), 0) AS totalComptageFiche,
                    COALESCE(SUM(st.ecart), 0) AS totalEcart
                FROM personnels p
                INNER JOIN planning_personnel pp ON p.id = pp.id_personnel
                LEFT JOIN suivi_transport st ON pp.date_jour = st.date AND TIME_FORMAT(pp.heure_sortie, '%H:%i') = st.shift
                WHERE p.planifier = 1
                  AND pp.date_jour BETWEEN ? AND ?
                GROUP BY YEAR(pp.date_jour), WEEK(pp.date_jour, 1)
                ORDER BY pp.date_jour ASC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute([$startDate, $endDate]);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getDetailedData(string $date): array
    {
        try {
            $sql = "SELECT 
                    Date,
                    SHIFT,
                    Axe,
                    Arret,
                    Commander,
                    ComptageFiche,
                    Ecart
                FROM vue_suivi_detaille
                WHERE Date = ?
                ORDER BY SHIFT ASC, Axe ASC, Arret ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$date]);
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            error_log("Erreur getDetailedData: " . $e->getMessage());
            throw new Exception("Erreur lors de la récupération des données détaillées: " . $e->getMessage());
        }
    }

    public function getAvailableMonths(): array
    {
        $sql = "SELECT DISTINCT 
                    DATE_FORMAT(date_jour, '%Y-%m') AS month,
                    DATE_FORMAT(date_jour, '%M %Y') AS month_display
                FROM planning_personnel 
                ORDER BY date_jour DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute();
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function updateSuiviData(array $updates): array
    {
        $results = [
            'success' => [],
            'errors' => []
        ];

        foreach ($updates as $update) {
            try {
                if (!isset($update['date']) || !isset($update['shift']) || !isset($update['comptageFiche']) || !isset($update['ecart'])) {
                    $results['errors'][] = [
                        'data' => $update,
                        'error' => 'Données manquantes'
                    ];
                    continue;
                }

                // Vérifier si l'enregistrement existe déjà
                $checkSql = "SELECT id FROM suivi_transport WHERE date = ? AND shift = ?";
                $checkStmt = $this->db->prepare($checkSql);
                $checkStmt->execute([$update['date'], $update['shift']]);
                $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

                if ($existing) {
                    // Mise à jour
                    $sql = "UPDATE suivi_transport SET comptage_fiche = ?, ecart = ?, updated_at = NOW() WHERE date = ? AND shift = ?";
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute([
                        $update['comptageFiche'],
                        $update['ecart'],
                        $update['date'],
                        $update['shift']
                    ]);
                } else {
                    // Insertion
                    $sql = "INSERT INTO suivi_transport (date, shift, comptage_fiche, ecart, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())";
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute([
                        $update['date'],
                        $update['shift'],
                        $update['comptageFiche'],
                        $update['ecart']
                    ]);
                }

                $results['success'][] = [
                    'date' => $update['date'],
                    'shift' => $update['shift'],
                    'comptageFiche' => $update['comptageFiche'],
                    'ecart' => $update['ecart']
                ];

            } catch (Exception $e) {
                $results['errors'][] = [
                    'data' => $update,
                    'error' => $e->getMessage()
                ];
            }
        }

        return $results;
    }

    private function createSuiviTableIfNotExists(): void
    {
        try {
            $sql = "CREATE TABLE IF NOT EXISTS suivi_transport (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date DATE NOT NULL,
                shift VARCHAR(5) NOT NULL,
                comptage_fiche INT DEFAULT 0,
                ecart INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_date_shift (date, shift)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

            $this->db->exec($sql);
        } catch (Exception $e) {
            error_log("Erreur création table suivi_transport: " . $e->getMessage());
        }
    }

    public function getSavedSuiviData(string $startDate = null, string $endDate = null): array
    {
        $sql = "SELECT date, shift, comptage_fiche as comptageFiche, ecart FROM suivi_transport";
        $params = [];

        if ($startDate && $endDate) {
            $sql .= " WHERE date BETWEEN ? AND ?";
            $params = [$startDate, $endDate];
        } elseif ($startDate) {
            $sql .= " WHERE date = ?";
            $params = [$startDate];
        }

        $sql .= " ORDER BY date DESC, shift ASC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getCombinedData(array $baseData): array
    {
        $dates = array_unique(array_column($baseData, 'date'));
        $savedData = $this->getSavedSuiviData();

        $savedIndex = [];
        foreach ($savedData as $saved) {
            $key = $saved['date'] . '_' . $saved['shift'];
            $savedIndex[$key] = $saved;
        }

        $combined = [];
        foreach ($baseData as $item) {
            $key = $item['date'] . '_' . $item['shift'];
            if (isset($savedIndex[$key])) {
                $combined[] = array_merge($item, [
                    'comptageFiche' => $savedIndex[$key]['comptageFiche'],
                    'ecart' => $savedIndex[$key]['ecart']
                ]);
            } else {
                $combined[] = $item;
            }
        }

        return $combined;
    }

    public function getTransportDataOnly(string $startDate = null, string $endDate = null): array
    {
        $sql = "SELECT 
                    date,
                    shift,
                    comptage_fiche as comptageFiche,
                    ecart,
                    created_at,
                    updated_at
                FROM suivi_transport";
        $params = [];

        if ($startDate && $endDate) {
            $sql .= " WHERE date BETWEEN ? AND ?";
            $params = [$startDate, $endDate];
        } elseif ($startDate) {
            $sql .= " WHERE date = ?";
            $params = [$startDate];
        }

        $sql .= " ORDER BY date DESC, shift ASC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

}