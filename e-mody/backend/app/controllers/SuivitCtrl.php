<?php
require_once __DIR__ . '/../model/Suivit.php';

class SuivitCtrl
{
    private Suivit $model;

    public function __construct()
    {
        $this->model = new Suivit();
    }

    public function getSuivitData()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $mode = $_GET['mode'] ?? 'daily';
            $date = $_GET['date'] ?? date('Y-m-d');
            $month = $_GET['month'] ?? date('Y-m');

            // Validation des paramètres
            if ($mode === 'daily' && !$this->isValidDate($date)) {
                throw new InvalidArgumentException('Date invalide');
            }

            if (($mode === 'monthly' || $mode === 'weekly') && !$this->isValidMonth($month)) {
                throw new InvalidArgumentException('Mois invalide');
            }

            $data = [];
            $weeklyData = [];

            switch ($mode) {
                case 'daily':
                    $data = $this->model->getDailyData($date);
                    break;

                case 'monthly':
                    $startDate = $month . '-01';
                    $endDate = date('Y-m-t', strtotime($startDate));
                    $data = $this->model->getMonthlyData($startDate, $endDate);
                    $weeklyData = $this->model->getWeeklySummary($startDate, $endDate);
                    break;

                case 'weekly':
                    $startDate = $month . '-01';
                    $endDate = date('Y-m-t', strtotime($startDate));
                    $data = $this->model->getWeeklySummary($startDate, $endDate);
                    $weeklyData = $data; // Pour la compatibilité avec le frontend
                    break;

                default:
                    throw new InvalidArgumentException('Mode non valide');
            }

            echo json_encode([
                'success' => true,
                'data' => [
                    'historicalData' => $data,
                    'weeklySummary' => $weeklyData
                ],
                'meta' => [
                    'mode' => $mode,
                    'date' => $date,
                    'month' => $month,
                    'totalRecords' => count($data)
                ]
            ], JSON_UNESCAPED_UNICODE);

        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => $e->getMessage(),
                'code' => 'INVALID_PARAMETER'
            ]);
        } catch (Throwable $e) {
            http_response_code(500);
            error_log("Erreur SuivitCtrl getSuivitData: " . $e->getMessage());
            echo json_encode([
                'success' => false,
                'error' => 'Erreur serveur lors de la récupération des données',
                'debug' => $e->getMessage(), // À retirer en production
                'code' => 'SERVER_ERROR'
            ]);
        }
    }

    private function isValidDate($date) {
        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $date);
    }

    private function isValidMonth($month) {
        return (bool) preg_match('/^\d{4}-\d{2}$/', $month);
    }

    public function getDetailedExport()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $date = $_GET['date'] ?? date('Y-m-d');

            $data = $this->model->getDetailedData($date);

            echo json_encode([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'date' => $date,
                    'totalRecords' => count($data)
                ]
            ], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getAvailableMonths()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $months = $this->model->getAvailableMonths();

            echo json_encode([
                'success' => true,
                'data' => $months,
                'meta' => [
                    'total' => count($months)
                ]
            ], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function updateSuiviData()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            // Récupérer les données JSON du corps de la requête
            $input = file_get_contents('php://input');
            $data = json_decode($input, true);

            if (!$data || !isset($data['updates']) || !is_array($data['updates'])) {
                throw new InvalidArgumentException('Données de mise à jour invalides');
            }

            $results = $this->model->updateSuiviData($data['updates']);

            if (empty($results['errors'])) {
                echo json_encode([
                    'success' => true,
                    'message' => count($results['success']) . ' mise(s) à jour effectuée(s) avec succès',
                    'data' => $results['success']
                ], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode([
                    'success' => false,
                    'message' => count($results['success']) . ' réussite(s), ' . count($results['errors']) . ' erreur(s)',
                    'data' => [
                        'success' => $results['success'],
                        'errors' => $results['errors']
                    ]
                ], JSON_UNESCAPED_UNICODE);
            }

        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getSavedData()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $date = $_GET['date'] ?? null;
            $month = $_GET['month'] ?? null;

            $startDate = null;
            $endDate = null;

            if ($date) {
                $startDate = $date;
                $endDate = $date;
            } elseif ($month) {
                $startDate = $month . '-01';
                $endDate = date('Y-m-t', strtotime($startDate));
            }

            $data = $this->model->getSavedSuiviData($startDate, $endDate);

            echo json_encode([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'totalRecords' => count($data),
                    'date' => $date,
                    'month' => $month
                ]
            ], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function testQueries()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $today = date('Y-m-d');
            $currentMonth = date('Y-m');
            $startDate = $currentMonth . '-01';
            $endDate = date('Y-m-t');

            $results = [
                'daily' => $this->model->getDailyData($today),
                'monthly' => $this->model->getMonthlyData($startDate, $endDate),
                'weekly' => $this->model->getWeeklySummary($startDate, $endDate),
                'detailed' => $this->model->getDetailedData($today),
                'months' => $this->model->getAvailableMonths(),
                'saved' => $this->model->getSavedSuiviData()
            ];

            echo json_encode([
                'success' => true,
                'data' => $results
            ], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
    
}