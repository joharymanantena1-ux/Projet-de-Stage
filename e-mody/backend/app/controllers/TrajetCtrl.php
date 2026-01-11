<?php

require_once __DIR__ . '/../model/Trajet.php';

class TrajetCtrl
{
    private Trajet $model;

    public function __construct()
    {
        $this->model = new Trajet();
    }

    public function listeTrajet()
    {
        try {

            header('Content-Type: application/json; charset=utf-8');

            // $manisa = $this->model->countTrajets();
            // if ($manisa === 0) {
            //     $this->model->generateSampleTrips();
            // }

            $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : null;
            $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : null;

            $filters = [];
            if (isset($_GET['employee_id'])) $filters['employee_id'] = intval($_GET['employee_id']);
            if (isset($_GET['employee_name'])) $filters['employee_name'] = trim($_GET['employee_name']);
            if (isset($_GET['date'])) $filters['date'] = $_GET['date'];
            if (isset($_GET['status'])) $filters['status'] = $_GET['status'];

            $options = [];
            if ($limit !== null) $options['limit'] = $limit;
            if ($offset !== null) $options['offset'] = $offset;
            $options['order'] = 't.id DESC';

            $rows = $this->model->listAll($filters, $options);

            if ($limit !== null) {
                $totalRows = count($this->model->listAll($filters, []));
            } else {
                $totalRows = count($rows);
            }

            echo json_encode([
                'data' => array_map(fn($r) => $this->model->formatForFrontend($r), $rows),
                'meta' => [
                    'total' => (int)$totalRows,
                    'limit' => $limit === null ? null : (int)$limit,
                    'offset' => $offset === null ? null : (int)$offset,
                ]
            ], JSON_UNESCAPED_UNICODE);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function createTrajet()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $data = $this->getJsonInput();
            if (empty($data) || !is_array($data)) {
                http_response_code(400);
                echo json_encode(['error' => 'Données manquantes ou format JSON invalide.']);
                return;
            }

            if (isset($data['id'])) unset($data['id']);

            $insertId = $this->model->createFromForm($data);

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'id' => (int)$insertId,
                'message' => 'Trajet créé avec données OSRM calculées'
            ], JSON_UNESCAPED_UNICODE);

        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (RuntimeException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function showTrajet($id = null)
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            if ($id === null) {
                if (isset($_GET['id'])) $id = intval($_GET['id']);
            }

            if (empty($id) || !is_numeric($id) || intval($id) <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Identifiant (id) requis.']);
                return;
            }

            $row = $this->model->findWithDetails((int)$id);
            if ($row === null) {
                http_response_code(404);
                echo json_encode(['error' => 'Trajet non trouvé.']);
                return;
            }

            $formatted = $this->model->formatForFrontend($row);
            echo json_encode(['data' => $formatted], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function simulateRoute()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $body = $this->getJsonInput() ?? [];
            $start_lat = $_GET['start_lat'] ?? $body['start_lat'] ?? null;
            $start_lng = $_GET['start_lng'] ?? $body['start_lng'] ?? null;
            $end_lat   = $_GET['end_lat']   ?? $body['end_lat']   ?? null;
            $end_lng   = $_GET['end_lng']   ?? $body['end_lng']   ?? null;

            if (!is_numeric($start_lat) || !is_numeric($start_lng) || !is_numeric($end_lat) || !is_numeric($end_lng)) {
                http_response_code(400);
                echo json_encode(['error' => 'Paramètres start_lat,start_lng,end_lat,end_lng requis et numériques.']);
                return;
            }

            $route = $this->model->getRouteFromOsrm((float)$start_lat, (float)$start_lng, (float)$end_lat, (float)$end_lng);
            echo json_encode(['route' => $route], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    /**
     * MÉTHODE MIGRATION - À appeler une fois pour corriger tous les trajets
     */
    public function migrateAllTrajets()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');
            
            $results = $this->model->executeMigration();
            
            echo json_encode([
                'success' => true,
                'message' => 'Migration OSRM terminée',
                'results' => $results
            ], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    private function getJsonInput(): ?array
    {
        $body = file_get_contents('php://input');
        if ($body === false || trim($body) === '') return null;

        $data = json_decode($body, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('JSON invalide : ' . json_last_error_msg());
        }

        return $data;
    }
}