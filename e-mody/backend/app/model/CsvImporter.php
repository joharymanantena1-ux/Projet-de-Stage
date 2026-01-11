<?php

    require_once __DIR__ . '/Personnel.php';
    require_once __DIR__ .'/Axe.php';
    require_once __DIR__ . '/Arret.php';
    require_once __DIR__ .'/Car.php';
    require_once __DIR__ . '/Assignment.php';
    require_once __DIR__ . '/Planning.php';

    class CsvImporter
    {
        private Personnel $model;
        private Axe $axeModel;
        private Arret $arretModel;
        private Car $carModel;
        private Assignment $assignmentModel;
        private Planning $planningModel;

        public function __construct()
        {
            $this->model = new Personnel();
            $this->axeModel = new Axe();
            $this->arretModel = new Arret();
            $this->carModel = new Car();
            $this->assignmentModel = new Assignment();
            $this->planningModel = new Planning();
        }

        public function importPersonnels(string $csvFile): array
        {
            if (!file_exists($csvFile)) {
                throw new RuntimeException("Fichier CSV introuvable: $csvFile");
            }

            $handle = fopen($csvFile, 'r');
            if (!$handle) {
                throw new RuntimeException("Impossible d'ouvrir le fichier: $csvFile");
            }

            $header = fgetcsv($handle, 1000, ','); // lecture de l’entête
            if (!$header) {
                throw new RuntimeException("Le CSV est vide ou invalide");
            }

            $inserted = 0;
            $errors = [];
            $this->model->beginTransaction();

            try {
                while (($row = fgetcsv($handle, 1000, ',')) !== false) {
                    $data = array_combine($header, $row);

                    // Validation minimale
                    if (empty($data['matricule']) || empty($data['nom']) || empty($data['prenom'])) {
                        $errors[] = "Ligne invalide: " . implode(',', $row);
                        continue;
                    }

                    // Mapping vers les colonnes MySQL
                    $record = [
                        'matricule'      => trim($data['matricule']),
                        'nom'            => trim($data['nom']),
                        'prenom'         => trim($data['prenom']),
                        'adresse'        => $data['adresse'] ?? null,
                        'latitude'       => $data['latitude'] ?? null,
                        'longitude'      => $data['longitude'] ?? null,
                        'planifier'      => $data['planifier'] ?? 1,
                        'sexe'           => $data['sexe'] ?? null,
                        'date_naissance' => !empty($data['date_naissance']) ? date('Y-m-d', strtotime($data['date_naissance'])) : null,
                        'statut'         => $data['statut'] ?? null,
                        'fonction'       => $data['fonction'] ?? null,
                        'campagne'       => $data['campagne'] ?? null,
                    ];

                    try {
                        $this->model->create($record);
                        $inserted++;
                    } catch (Exception $e) {
                        $errors[] = "Erreur ligne (" . $data['matricule'] . "): " . $e->getMessage();
                    }
                }

                $this->model->commit();
            } catch (Exception $e) {
                $this->model->rollback();
                throw $e;
            } finally {
                fclose($handle);
            }

            return ['inserted' => $inserted, 'errors' => $errors];
        }

        public function importAxes(string $csvFile): array
        {
            if (!file_exists($csvFile)) {
                throw new RuntimeException("Fichier CSV introuvable: $csvFile");
            }

            $handle = fopen($csvFile, 'r');
            if (!$handle) {
                throw new RuntimeException("Impossible d'ouvrir le fichier: $csvFile");
            }

            // Ignorer l'en-tête
            fgetcsv($handle, 1000, ',');

            $currentAxe = null;
            $inserted = 0;
            $errors = [];
            $this->axeModel->beginTransaction();

            try {
                while (($row = fgetcsv($handle, 1000, ',')) !== false) {
                    // Nettoyer les valeurs
                    $row = array_map('trim', $row);
                    
                    // Ignorer les lignes complètement vides
                    if (count(array_filter($row)) === 0) {
                        continue;
                    }
                    
                    // Gérer les cellules vides - format: [empty, axe, secteur, kilometrage]
                    $axe = !empty($row[1]) ? $row[1] : null;
                    $secteur = !empty($row[2]) ? $row[2] : null;
                    $kilometrage = !empty($row[3]) && is_numeric(str_replace(',', '.', $row[3])) 
                        ? (float) str_replace(',', '.', $row[3]) 
                        : null;

                    // Si on a un nouvel axe, mettre à jour l'axe courant
                    if (!empty($axe)) {
                        $currentAxe = $axe;
                    }

                    // Validation des données
                    if (empty($currentAxe) || empty($secteur)) {
                        $errors[] = "Ligne invalide: " . implode(',', $row);
                        continue;
                    }

                    try {
                        // Créer un nouvel enregistrement pour chaque ligne avec l'axe courant
                        $this->axeModel->create([
                            'nom_axe' => $currentAxe,
                            'point_depart' => "Konecta Ivandry",
                            'point_arrivee' => $secteur,
                            'kilometrage' => $kilometrage
                        ]);
                        $inserted++;
                    } catch (Exception $e) {
                        $errors[] = "Erreur ligne (" . $currentAxe . " - " . $secteur . "): " . $e->getMessage();
                    }
                }

                $this->axeModel->commit();
            } catch (Exception $e) {
                $this->axeModel->rollback();
                throw $e;
            } finally {
                fclose($handle);
            }

            return [
                'inserted' => $inserted,
                'errors' => $errors
            ];
        }

        public function importArrets(string $csvFile): array
        {
            if (!file_exists($csvFile)) {
                throw new RuntimeException("Fichier CSV introuvable: $csvFile");
            }

            $handle = fopen($csvFile, 'r');
            if (!$handle) {
                throw new RuntimeException("Impossible d'ouvrir le fichier: $csvFile");
            }

            $header = fgetcsv($handle, 1000, ',');
            if (!$header) {
                throw new RuntimeException("Le CSV est vide ou invalide");
            }

            $inserted = 0;
            $errors = [];
            $this->arretModel->beginTransaction();

            try {
                while (($row = fgetcsv($handle, 1000, ',')) !== false) {
                    $data = array_combine($header, $row);

                    // Validation minimale
                    if (empty($data['nom_arret']) || !isset($data['id_axe']) || !isset($data['ordre'])) {
                        $errors[] = "Ligne invalide: " . implode(',', $row);
                        continue;
                    }

                    // Nettoyage / mapping
                    $record = [
                        'nom_arret' => trim($data['nom_arret']),
                        'longitude' => isset($data['longitude']) && $data['longitude'] !== '' ? (float) str_replace(',', '.', $data['longitude']) : null,
                        'latitude'  => isset($data['latitude']) && $data['latitude'] !== '' ? (float) str_replace(',', '.', $data['latitude']) : null,
                        'id_axe'    => (int) $data['id_axe'],
                        'ordre'     => (int) $data['ordre'],
                    ];

                    try {
                        // Optionnel : vérifier que l'axe existe (si votre modèle a find)
                        if (method_exists($this->axeModel, 'find') && !$this->axeModel->find($record['id_axe'])) {
                            $errors[] = "Axe introuvable id_axe={$record['id_axe']} pour arret {$record['nom_arret']}";
                            continue;
                        }

                        $this->arretModel->create($record);
                        $inserted++;
                    } catch (Exception $e) {
                        $errors[] = "Erreur arret ({$record['nom_arret']}): " . $e->getMessage();
                    }
                }

                $this->arretModel->commit();
            } catch (Exception $e) {
                $this->arretModel->rollback();
                throw $e;
            } finally {
                fclose($handle);
            }

            return ['inserted' => $inserted, 'errors' => $errors];
        }

        public function importCars(string $csvFile): array
        {
            if (!file_exists($csvFile)) {
                throw new RuntimeException("Fichier CSV introuvable: $csvFile");
            }

            $handle = fopen($csvFile, 'r');
            if (!$handle) {
                throw new RuntimeException("Impossible d'ouvrir le fichier: $csvFile");
            }

            $header = fgetcsv($handle, 1000, ',');
            if (!$header) {
                throw new RuntimeException("Le CSV est vide ou invalide");
            }

            $inserted = 0;
            $errors = [];
            $this->carModel->beginTransaction();

            try {
                while (($row = fgetcsv($handle, 1000, ',')) !== false) {
                    $data = array_combine($header, $row);

                    if (empty($data['nom_car']) || !isset($data['capacite'])) {
                        $errors[] = "Ligne invalide: " . implode(',', $row);
                        continue;
                    }

                    $record = [
                        'nom_car'   => trim($data['nom_car']),
                        'capacite'  => (int) $data['capacite'],
                        'disponible'=> isset($data['disponible']) ? (int) $data['disponible'] : 1,
                        'depot_lat' => isset($data['depot_lat']) && $data['depot_lat'] !== '' ? (float) str_replace(',', '.', $data['depot_lat']) : null,
                        'depot_lng' => isset($data['depot_lng']) && $data['depot_lng'] !== '' ? (float) str_replace(',', '.', $data['depot_lng']) : null,
                    ];

                    try {
                        $this->carModel->create($record);
                        $inserted++;
                    } catch (Exception $e) {
                        $errors[] = "Erreur car ({$record['nom_car']}): " . $e->getMessage();
                    }
                }

                $this->carModel->commit();
            } catch (Exception $e) {
                $this->carModel->rollback();
                throw $e;
            } finally {
                fclose($handle);
            }

            return ['inserted' => $inserted, 'errors' => $errors];
        }
        
        // public function importAssignments(string $csvFile): array
        // {
        //     if (!file_exists($csvFile)) {
        //         throw new RuntimeException("Fichier CSV introuvable: $csvFile");
        //     }

        //     $handle = fopen($csvFile, 'r');
        //     if (!$handle) {
        //         throw new RuntimeException("Impossible d'ouvrir le fichier: $csvFile");
        //     }

        //     $header = fgetcsv($handle, 1000, ',');
        //     if (!$header) {
        //         throw new RuntimeException("Le CSV est vide ou invalide");
        //     }

        //     $inserted = 0;
        //     $errors = [];
        //     $this->assignmentModel->beginTransaction();

        //     try {
        //         while (($row = fgetcsv($handle, 1000, ',')) !== false) {
        //             $data = array_combine($header, $row);

        //             // champs requis
        //             if (empty($data['id_car']) || empty($data['id_arret']) || empty($data['id_personnel']) || empty($data['date_assignment'])) {
        //                 $errors[] = "Ligne invalide: " . implode(',', $row);
        //                 continue;
        //             }

        //             $record = [
        //                 'id_car' => (int) $data['id_car'],
        //                 'id_arret' => (int) $data['id_arret'],
        //                 'id_personnel' => (int) $data['id_personnel'],
        //                 'assigned_at' => isset($data['assigned_at']) && $data['assigned_at'] !== '' ? date('Y-m-d H:i:s', strtotime($data['assigned_at'])) : date('Y-m-d H:i:s'),
        //                 'date_assignment' => date('Y-m-d', strtotime($data['date_assignment'])),
        //             ];

        //             try {
        //                 // Optionnel : vérifier que les FK existent si find() est disponible
        //                 if (method_exists($this->carModel, 'find') && !$this->carModel->find($record['id_car'])) {
        //                     $errors[] = "Car introuvable id_car={$record['id_car']}";
        //                     continue;
        //                 }
        //                 if (method_exists($this->arretModel, 'find') && !$this->arretModel->find($record['id_arret'])) {
        //                     $errors[] = "Arret introuvable id_arret={$record['id_arret']}";
        //                     continue;
        //                 }
        //                 if (method_exists($this->model, 'find') && !$this->model->find($record['id_personnel'])) {
        //                     $errors[] = "Personnel introuvable id_personnel={$record['id_personnel']}";
        //                     continue;
        //                 }

        //                 $this->assignmentModel->create($record);
        //                 $inserted++;
        //             } catch (Exception $e) {
        //                 $errors[] = "Erreur assignment (car {$record['id_car']} - pers {$record['id_personnel']}): " . $e->getMessage();
        //             }
        //         }

        //         $this->assignmentModel->commit();
        //     } catch (Exception $e) {
        //         $this->assignmentModel->rollback();
        //         throw $e;
        //     } finally {
        //         fclose($handle);
        //     }

        //     return ['inserted' => $inserted, 'errors' => $errors];
        // }

    
    public function importAssignments(string $csvFile): array
    {
        if (!file_exists($csvFile)) {
            throw new RuntimeException("Fichier CSV introuvable: $csvFile");
        }

        $handle = fopen($csvFile, 'r');
        if (!$handle) {
            throw new RuntimeException("Impossible d'ouvrir le fichier: $csvFile");
        }

        $header = fgetcsv($handle, 1000, ',');
        if (!$header) {
            throw new RuntimeException("Le CSV est vide ou invalide");
        }

        $inserted = 0;
        $errors = [];
        $this->assignmentModel->beginTransaction();

        try {
            while (($row = fgetcsv($handle, 1000, ',')) !== false) {
                $data = array_combine($header, $row);

                // Nettoyage des données avec valeurs par défaut si vides
                $matricule = trim($data['Matricule WD']);
                $prenom = !empty(trim($data['agentFirstname'])) ? trim($data['agentFirstname']) : "Agent_" . $matricule;
                $adresse = !empty(trim($data['Adresse'])) ? trim($data['Adresse']) : "Adresse non spécifiée";
                $fonction = !empty(trim($data['affectationLib'])) ? trim($data['affectationLib']) : "Fonction non spécifiée";
                $dateAssignment = trim($data['startDate']);
                $heureRemisage = trim($data['#Remisage endTime']);
                $nomAxe = !empty(trim($data['zone AJ dans lsite SG'])) ? trim($data['zone AJ dans lsite SG']) : "DEFAULT_AXE";

                // Validation des champs requis - seulement matricule et date sont obligatoires
                if (empty($matricule) || empty($dateAssignment)) {
                    $errors[] = "Ligne invalide (matricule ou date manquants): " . implode(',', $row);
                    continue;
                }

                try {
                    // CONDITION 1: Vérifier/Créer le personnel
                    $personnelId = $this->findOrCreatePersonnel($matricule, $prenom, $adresse, $fonction, $errors);
                    if (!$personnelId) continue;

                    // CONDITION 2: Vérifier/Créer l'axe
                    $axeId = $this->findOrCreateAxe($nomAxe, $errors);
                    if (!$axeId) continue;

                    // CONDITION 3: Vérifier/Créer l'arrêt
                    $arretId = $this->findOrCreateArret($adresse, $axeId, $nomAxe, $errors);
                    if (!$arretId) continue;

                    // CONDITION 4: Trouver une voiture disponible
                    $carId = $this->findAvailableCar($errors);
                    if (!$carId) continue;

                    // Créer l'assignment (sans heure_remisage)
                    $assignmentRecord = [
                        'id_car' => $carId,
                        'id_arret' => $arretId,
                        'id_personnel' => $personnelId,
                        'assigned_at' => date('Y-m-d H:i:s'),
                        'date_assignment' => date('Y-m-d', strtotime($dateAssignment)),
                    ];

                    $this->assignmentModel->create($assignmentRecord);
                    $inserted++;

                    // Gérer l'heure de remisage dans planning_personnel
                    if (!empty($heureRemisage)) {
                        $this->createOrUpdatePlanningPersonnel($personnelId, $dateAssignment, $heureRemisage, $errors);
                    }

                } catch (Exception $e) {
                    $errors[] = "Erreur ligne (matricule $matricule): " . $e->getMessage();
                }
            }

            $this->assignmentModel->commit();
        } catch (Exception $e) {
            $this->assignmentModel->rollback();
            throw $e;
        } finally {
            fclose($handle);
        }

        return ['inserted' => $inserted, 'errors' => $errors];
    }

    
    private function findOrCreatePersonnel($matricule, $prenom, $adresse, $fonction, &$errors)
    {
        $personnel = $this->model->findByMatricule($matricule);

        if (!$personnel) {
            // Créer le personnel manquant
            $personnelData = [
                'matricule' => $matricule,
                'nom' => $prenom,
                'prenom' => $prenom,
                'adresse' => $adresse,
                'fonction' => $fonction,
                'planifier' => 1,
                'statut' => 'Actif',
                'campagne' => date('Y'),
            ];

            try {
                return $this->model->create($personnelData);
            } catch (Exception $e) {
                $errors[] = "Erreur création personnel ($matricule): " . $e->getMessage();
                return null;
            }
        }

        return $personnel['id'];
    }

    private function findOrCreateAxe($nomAxe, &$errors)
    {
        $axe = $this->axeModel->findByNom($nomAxe);

        if (!$axe) {
            // Créer l'axe manquant
            $axeData = [
                'nom_axe' => $nomAxe,
                'point_depart' => "Konecta Ivandry",
                'point_arrivee' => $nomAxe,
                'kilometrage' => null
            ];

            try {
                return $this->axeModel->create($axeData);
            } catch (Exception $e) {
                $errors[] = "Erreur création axe ($nomAxe): " . $e->getMessage();
                return null;
            }
        }

        return $axe['id'];
    }

    private function findOrCreateArret($adresse, $axeId, $nomAxe, &$errors)
    {
        $arret = $this->arretModel->findByAdresseAndAxe($adresse, $axeId);

        if (!$arret) {
            // Générer des coordonnées réalistes
            $coordinates = $this->generateRealisticCoordinates($nomAxe, $adresse);
            
            // Déterminer l'ordre automatiquement en utilisant la méthode du modèle
            $ordre = $this->arretModel->getNextOrdreForAxe($axeId);
            
            // Créer l'arrêt manquant
            $arretData = [
                'nom_arret' => $adresse,
                'id_axe' => $axeId,
                'ordre' => $ordre,
                'latitude' => $coordinates['latitude'],
                'longitude' => $coordinates['longitude']
            ];

            try {
                return $this->arretModel->create($arretData);
            } catch (Exception $e) {
                $errors[] = "Erreur création arrêt ($adresse): " . $e->getMessage();
                return null;
            }
        }

        return $arret['id'];
    }

    private function generateRealisticCoordinates($nomAxe, $adresse): array
    {
        $prefix = substr($nomAxe, 0, 1);
        
        // Zones géographiques pour Antananarivo basées sur les préfixes d'axe
        $zones = [
            'U' => ['base_lat' => -18.9100, 'base_lng' => 47.5300, 'spread' => 0.02],
            'V' => ['base_lat' => -18.8700, 'base_lng' => 47.4800, 'spread' => 0.03],
            'W' => ['base_lat' => -18.8900, 'base_lng' => 47.5500, 'spread' => 0.02],
            'X' => ['base_lat' => -18.8500, 'base_lng' => 47.5200, 'spread' => 0.03],
            'Y' => ['base_lat' => -18.9200, 'base_lng' => 47.5000, 'spread' => 0.03],
            'Z' => ['base_lat' => -18.8800, 'base_lng' => 47.4700, 'spread' => 0.02]
        ];

        $zone = $zones[$prefix] ?? $zones['U'];
        
        $hash = crc32($adresse . $nomAxe);
        mt_srand($hash);
        
        $lat = $zone['base_lat'] + (mt_rand(0, 1000) / 10000.0) * $zone['spread'];
        $lng = $zone['base_lng'] + (mt_rand(0, 1000) / 10000.0) * $zone['spread'];
        
        mt_srand();
        
        return [
            'latitude' => round($lat, 6),
            'longitude' => round($lng, 6)
        ];
    }

    private function findAvailableCar(&$errors)
    {
        // Recherche d'une voiture disponible
        $car = $this->carModel->findAvailable();

        if (!$car) {
            // Créer une voiture par défaut si aucune disponible
            $carData = [
                'nom_car' => 'DEFAULT_CAR_' . date('YmdHis'),
                'capacite' => 20,
                'disponible' => 1,
                'depot_lat' => -18.8792,
                'depot_lng' => 47.5079
            ];

            try {
                return $this->carModel->create($carData);
            } catch (Exception $e) {
                $errors[] = "Erreur création voiture par défaut: " . $e->getMessage();
                return null;
            }
        }

        return $car['id'];
    }

    private function createOrUpdatePlanningPersonnel($personnelId, $dateAssignment, $heureRemisage, &$errors)
    {
        try {
            $dateJour = date('Y-m-d', strtotime($dateAssignment));
            
            // Vérifier si un planning existe déjà pour cette personne à cette date
            $existingPlanning = $this->planningModel->findByPersonnelAndDate($personnelId, $dateJour);
            
            if ($existingPlanning) {
                // Mettre à jour l'heure de sortie si le planning existe déjà
                $this->planningModel->updateSortie($existingPlanning['id'], $heureRemisage);
            } else {
                // Créer un nouveau planning avec une heure de rentrée par défaut
                $planningData = [
                    'id_personnel' => $personnelId,
                    'date_jour' => $dateJour,
                    'heure_rentree' => '08:00:00', // Heure par défaut
                    'heure_sortie' => $heureRemisage
                ];
                
                $this->planningModel->createPlanning($planningData);
            }
        } catch (Exception $e) {
            $errors[] = "Erreur création/mise à jour planning (personnel $personnelId): " . $e->getMessage();
        }
    }

}
