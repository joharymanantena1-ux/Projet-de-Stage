<?php

    require_once __DIR__ . '/../model/Assignment.php';
    require_once __DIR__ . '/../model/Personnel.php';
    require_once __DIR__ . '/../model/Car.php';
    require_once __DIR__ . '/../model/Arret.php';

    class AssignmentCtrl
    {
        private Assignment $model;
        private Personnel $personnelModel;
        private Car $carModel;
        private Arret $arretModel;

        public function __construct()
        {
            $this->model = new Assignment();
            $this->personnelModel = new Personnel();
            $this->carModel = new Car();
            $this->arretModel = new Arret();
        }

        /**
         * Liste des assignations avec filtres
         */
        public function listeAssignments()
        {
            try {
                header('Content-Type: application/json; charset=utf-8');

                $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : null;
                $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : null;

                $options = [];
                if ($limit !== null) $options['limit'] = $limit;
                if ($offset !== null) $options['offset'] = $offset;

                // Ordre par défaut
                $options['order'] = 'a.date_assignment DESC, a.assigned_at DESC';

                $conditions = [];

                // Filtre par date
                if (isset($_GET['date']) && trim($_GET['date']) !== '') {
                    $conditions['a.date_assignment = ?'] = $_GET['date'];
                }

                // Filtre par véhicule
                if (isset($_GET['car_id']) && intval($_GET['car_id']) > 0) {
                    $conditions['a.id_car = ?'] = intval($_GET['car_id']);
                }

                // Filtre par personnel
                if (isset($_GET['personnel_id']) && intval($_GET['personnel_id']) > 0) {
                    $conditions['a.id_personnel = ?'] = intval($_GET['personnel_id']);
                }

                // Filtre par arrêt
                if (isset($_GET['arret_id']) && intval($_GET['arret_id']) > 0) {
                    $conditions['a.id_arret = ?'] = intval($_GET['arret_id']);
                }

                $rows = $this->model->getWithDetails($conditions, $options);
                $total = $this->model->count($conditions);

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

        /**
         * Récupérer une assignation par ID
         */
        public function showAssignment($id = null)
        {
            try {
                header('Content-Type: application/json; charset=utf-8');

                if ($id === null && isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                }

                if (empty($id) || !is_numeric($id) || intval($id) <= 0) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Identifiant (id) requis.']);
                    return;
                }

                $assignments = $this->model->getWithDetails(['a.id = ?'], ['limit' => 1], [$id]);
                
                if (empty($assignments)) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Assignation non trouvée.']);
                    return;
                }

                echo json_encode(['data' => $assignments[0]], JSON_UNESCAPED_UNICODE);
            } catch (Throwable $e) {
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
            }
        }

        /**
         * Créer une nouvelle assignation
         */
        public function createAssignment()
        {
            try {
                header('Content-Type: application/json; charset=utf-8');

                $data = $this->getJsonInput();

                if (empty($data) || !is_array($data)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Données manquantes ou format JSON invalide.']);
                    return;
                }

                // Validation des champs requis
                $required = ['id_car', 'id_arret', 'id_personnel', 'date_assignment'];
                foreach ($required as $field) {
                    if (!isset($data[$field]) || empty($data[$field])) {
                        http_response_code(400);
                        echo json_encode(['error' => "Le champ '$field' est requis."]);
                        return;
                    }
                }

                // Vérifier l'existence des entités liées
                if (!$this->carModel->find($data['id_car'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Véhicule non trouvé.']);
                    return;
                }

                if (!$this->arretModel->find($data['id_arret'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Arrêt non trouvé.']);
                    return;
                }

                if (!$this->personnelModel->find($data['id_personnel'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Personnel non trouvé.']);
                    return;
                }

                // Vérifier si l'assignation existe déjà
                if ($this->model->assignmentExists(
                    $data['id_car'], 
                    $data['id_personnel'], 
                    $data['date_assignment']
                )) {
                    http_response_code(409);
                    echo json_encode(['error' => 'Assignation déjà existante pour cette date.']);
                    return;
                }

                $insertId = $this->model->create($data);

                http_response_code(201);
                echo json_encode([
                    'success' => true,
                    'id' => (int)$insertId,
                    'message' => 'Assignation créée avec succès'
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
         * Mettre à jour une assignation
         */
        public function updateAssignment($id = null)
        {
            try {
                header('Content-Type: application/json; charset=utf-8');

                $data = $this->getJsonInput();

                if ($id === null) {
                    if (isset($_GET['id'])) {
                        $id = intval($_GET['id']);
                    } elseif (isset($data['id'])) {
                        $id = $data['id'];
                        unset($data['id']);
                    }
                }

                if (empty($id) || !is_numeric($id) || intval($id) <= 0) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Identifiant (id) requis pour la mise à jour.']);
                    return;
                }

                if (empty($data) || !is_array($data)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Aucune donnée fournie pour la mise à jour.']);
                    return;
                }

                // Vérifier que l'assignation existe
                if (!$this->model->find($id)) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Assignation non trouvée.']);
                    return;
                }

                // Vérifier l'existence des entités liées si fournies
                if (isset($data['id_car']) && !$this->carModel->find($data['id_car'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Véhicule non trouvé.']);
                    return;
                }

                if (isset($data['id_arret']) && !$this->arretModel->find($data['id_arret'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Arrêt non trouvé.']);
                    return;
                }

                if (isset($data['id_personnel']) && !$this->personnelModel->find($data['id_personnel'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Personnel non trouvé.']);
                    return;
                }

                $affected = $this->model->update((int)$id, $data);

                echo json_encode([
                    'success' => true,
                    'affected' => (int)$affected,
                    'message' => 'Assignation mise à jour avec succès'
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
         * Supprimer une assignation
         */
        public function deleteAssignment($id = null)
        {
            try {
                header('Content-Type: application/json; charset=utf-8');

                if ($id === null && isset($_GET['id'])) {
                    $id = intval($_GET['id']);
                }

                if (empty($id) || !is_numeric($id) || intval($id) <= 0) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Identifiant (id) requis pour la suppression.']);
                    return;
                }

                $deleted = $this->model->delete((int)$id);

                echo json_encode([
                    'success' => true,
                    'deleted' => (int)$deleted,
                    'message' => 'Assignation supprimée avec succès'
                ], JSON_UNESCAPED_UNICODE);
            } catch (Throwable $e) {
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
            }
        }

        /**
         * Assigner du personnel à un arrêt (méthode simplifiée)
         */
        public function assignPersonnelToArret()
        {
            try {
                header('Content-Type: application/json; charset=utf-8');

                $data = $this->getJsonInput();

                if (empty($data) || !is_array($data)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Données manquantes ou format JSON invalide.']);
                    return;
                }

                // Validation
                if (!isset($data['id_personnel']) || !isset($data['id_arret'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'id_personnel et id_arret sont requis.']);
                    return;
                }

                // Vérifier l'existence
                if (!$this->personnelModel->find($data['id_personnel'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Personnel non trouvé.']);
                    return;
                }

                if (!$this->arretModel->find($data['id_arret'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Arrêt non trouvé.']);
                    return;
                }

                // Mettre à jour le personnel avec l'arrêt assigné
                $affected = $this->personnelModel->update($data['id_personnel'], [
                    'id_arret' => $data['id_arret']
                ]);

                echo json_encode([
                    'success' => true,
                    'affected' => (int)$affected,
                    'message' => 'Personnel assigné à l\'arrêt avec succès'
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