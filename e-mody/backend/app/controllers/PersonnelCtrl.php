<?php

require_once __DIR__ . '/../model/Personnel.php';

class PersonnelCtrl
{
    private Personnel $model;

    public function __construct()
    {
        $this->model = new Personnel();
    }

    public function listePersonnel()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : null;
            $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : null;

            $options = [];
            if ($limit !== null) $options['limit'] = $limit;
            if ($offset !== null) $options['offset'] = $offset;

            $options['order'] = 'nom ASC, prenom ASC';

            $rows = $this->model->all([], $options);

            $total = $this->model->count();

            echo json_encode([
                'data' => $rows,
                'meta' => [
                    'total' => (int)$total,
                    'limit' => $limit === null ? null : (int)$limit,
                    'offset' => $offset === null ? null : (int)$offset,
                ]
            ], JSON_UNESCAPED_UNICODE);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function createPersonnel()
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

            $insertId = $this->model->create($data);

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'id' => is_numeric($insertId) ? (int)$insertId : $insertId
            ], JSON_UNESCAPED_UNICODE);

        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function updatePersonnel($id = null)
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $data = $this->getJsonInput();

        
            if ($id === null) {
                if (isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                } else if (isset($data['id'])) {
                    $id = $data['id'];
                    unset($data['id']);
                }
            }

            if (empty($id)) {
                http_response_code(400);
                echo json_encode(['error' => 'Identifiant (id) requis pour la mise à jour.']);
                return;
            }

            if (empty($data) || !is_array($data)) {
                http_response_code(400);
                echo json_encode(['error' => 'Aucune donnée fournie pour la mise à jour.']);
                return;
            }

            $affected = $this->model->update($id, $data);

            echo json_encode([
                'success' => true,
                'affected' => (int)$affected
            ], JSON_UNESCAPED_UNICODE);

        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function deletePersonnel($id = null)
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            if ($id === null) {
                if (isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                }
            }

            if (empty($id)) {
                http_response_code(400);
                echo json_encode(['error' => 'Identifiant (id) requis pour la suppression.']);
                return;
            }

            $deleted = $this->model->delete($id);

            echo json_encode([
                'success' => true,
                'deleted' => (int)$deleted
            ], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }


    public function showPersonnel($id = null)
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            if ($id === null) {
                if (isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                }
            }

            if (empty($id)) {
                http_response_code(400);
                echo json_encode(['error' => 'Identifiant (id) requis.']);
                return;
            }

            $row = $this->model->find($id);

            if ($row === null) {
                http_response_code(404);
                echo json_encode(['error' => 'Personnel non trouvé.']);
                return;
            }

            echo json_encode(['data' => $row], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }


    private function getJsonInput(): ?array
    {
        $body = file_get_contents('php://input');
        if ($body === false || $body === '') return null;

        $data = json_decode($body, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('JSON invalide : ' . json_last_error_msg());
        }

        return $data;
    }
}
