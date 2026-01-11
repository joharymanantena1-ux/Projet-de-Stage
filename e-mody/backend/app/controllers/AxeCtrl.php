<?php

require_once __DIR__ . '/../model/Axe.php';

class AxeCtrl
{
    private Axe $model;

    public function __construct()
    {
        $this->model = new Axe();
    }

    public function listeAxe()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : null;
            $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : null;
            $distinct = isset($_GET['distinct']) ? $_GET['distinct'] : null;

            $options = [];
            if ($limit !== null) $options['limit'] = $limit;
            if ($offset !== null) $options['offset'] = $offset;
            
            if ($distinct === 'nom_axe') {
                $options['distinct'] = true;
                $options['order'] = 'nom_axe ASC';
            } else {
                $options['order'] = 'id ASC';
            }

            // Utiliser la nouvelle méthode allDistinct ou l'ancienne selon le besoin
            if ($distinct === 'nom_axe') {
                $rows = $this->model->allDistinct([], $options);
            } else {
                $rows = $this->model->all([], $options);
            }

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

    public function createAxe()
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $data = $this->getJsonInput();

            if (empty($data) || !is_array($data)) {
                http_response_code(400);
                echo json_encode(['error' => 'Données manquantes ou format JSON invalide.']);
                return;
            }

            // Optionnel : retirer un éventuel 'id' fourni
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

    /**
     * Mettre à jour un Axe.
     * $id peut venir en param, en querystring (?id=) ou dans le body JSON (id).
     * Réponse: { success: true, affected: <n> }
     */
    public function updateAxe($id = null)
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            $data = $this->getJsonInput();

            // si id non fourni en argument, chercher en query string ou dans le body
            if ($id === null) {
                if (isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                } else if (isset($data['id'])) {
                    $id = $data['id'];
                    unset($data['id']);
                }
            }

            if (empty($id) || !is_numeric($id) || intval($id) <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Identifiant (id) requis et invalide pour la mise à jour.']);
                return;
            }

            if (empty($data) || !is_array($data)) {
                http_response_code(400);
                echo json_encode(['error' => 'Aucune donnée fournie pour la mise à jour.']);
                return;
            }

            $affected = $this->model->update((int)$id, $data);

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

    /**
     * Supprimer un Axe.
     * $id peut venir en param ou querystring (?id=).
     * Réponse: { success: true, deleted: <n> }
     */
    public function deleteAxe($id = null)
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            if ($id === null) {
                if (isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                }
            }

            if (empty($id) || !is_numeric($id) || intval($id) <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Identifiant (id) requis pour la suppression.']);
                return;
            }

            $deleted = $this->model->delete((int)$id);

            echo json_encode([
                'success' => true,
                'deleted' => (int)$deleted
            ], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    /**
     * Récupérer un Axe par id.
     * $id peut venir en param ou querystring (?id=).
     * Réponse: { data: { ... } } ou 404
     */
    public function showAxe($id = null)
    {
        try {
            header('Content-Type: application/json; charset=utf-8');

            if ($id === null) {
                if (isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                }
            }

            if (empty($id) || !is_numeric($id) || intval($id) <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Identifiant (id) requis.']);
                return;
            }

            $row = $this->model->find((int)$id);

            if ($row === null) {
                http_response_code(404);
                echo json_encode(['error' => 'Axe non trouvé.']);
                return;
            }

            echo json_encode(['data' => $row], JSON_UNESCAPED_UNICODE);

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    /**
     * Lit et décode le JSON du body.
     * Retourne null si body vide.
     * Lance InvalidArgumentException si JSON invalide.
     *
     * @return array|null
     * @throws InvalidArgumentException
     */
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
