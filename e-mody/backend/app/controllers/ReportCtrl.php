<?php
require_once __DIR__ . '/../model/Assignment.php';

class ReportCtrl
{
    private Assignment $model;

    public function __construct()
    {
        $this->model = new Assignment();
    }

    public function plannedPersonnel()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $date = $_GET['date'] ?? date('Y-m-d');      
            $heure = $_GET['heure'] ?? '19:00:00';
            
            $useOptimization = $_GET['optimize'] ?? 'true';
            $useOptimization = filter_var($useOptimization, FILTER_VALIDATE_BOOLEAN);

            $d = \DateTime::createFromFormat('Y-m-d', $date);
            $t = \DateTime::createFromFormat('H:i:s', $heure);
            
            if (!$d || $d->format('Y-m-d') !== $date) {
                http_response_code(400);
                echo json_encode(['error' => 'Paramètre date invalide (format attendu YYYY-MM-DD).']);
                return;
            }
            
            if (!$t || $t->format('H:i:s') !== $heure) {
                http_response_code(400);
                echo json_encode(['error' => 'Paramètre heure invalide (format attendu HH:MM:SS).']);
                return;
            }

            $rows = $this->model->getPlannedPersonnelByDateAndTime($date, $heure);

            $response = [
                'data' => $rows,
                'metadata' => [
                    'date' => $date,
                    'heure_sortie' => $heure,
                    'optimisation_demande' => $useOptimization,
                    'total_personnels' => count($rows),
                    'timestamp' => date('Y-m-d H:i:s')
                ]
            ];

            echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode([
                'error' => $e->getMessage(),
                'trace' => $e->getTrace()
            ]);
        }
    }
}
