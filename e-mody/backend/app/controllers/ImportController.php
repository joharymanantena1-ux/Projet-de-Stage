<?php
require_once __DIR__ . '/../model/CsvImporter.php';

class ImportController
{
    private CsvImporter $importer;

    public function __construct()
    {
        $this->importer = new CsvImporter();
    }

    private function handleUploadAndImport(string $fieldName, callable $importCallback, string $prefix = 'import_')
    {
        if (!isset($_FILES[$fieldName])) {
            http_response_code(400);
            echo json_encode(['error' => 'Aucun fichier fourni']);
            return;
        }

        $file = $_FILES[$fieldName];

        // Vérifier que c’est bien un CSV
        $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
        if (strtolower($ext) !== 'csv') {
            http_response_code(400);
            echo json_encode(['error' => 'Seuls les fichiers CSV sont acceptés']);
            return;
        }

        // Déplacer le fichier uploadé vers un dossier temporaire
        $uploadDir = __DIR__ . '/../uploads/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $filePath = $uploadDir . uniqid($prefix, true) . '.csv';
        if (!move_uploaded_file($file['tmp_name'], $filePath)) {
            http_response_code(500);
            echo json_encode(['error' => 'Erreur lors de l\'upload du fichier']);
            return;
        }

        // Import via CsvImporter
        try {
            $result = $importCallback($filePath);
            echo json_encode($result);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        } finally {
            // Nettoyage : supprimer le fichier temporaire
            if (file_exists($filePath)) {
                @unlink($filePath);
            }
        }
    }

    public function importPersonnels()
    {
        $this->handleUploadAndImport('file', function($path) {
            return $this->importer->importPersonnels($path);
        }, 'import_personnels_');
    }

    public function importAxes()
    {
        $this->handleUploadAndImport('file', function($path) {
            return $this->importer->importAxes($path);
        }, 'import_axes_');
    }

    // --- Nouvelles méthodes ajoutées ---

    public function importArrets()
    {
        $this->handleUploadAndImport('file', function($path) {
            return $this->importer->importArrets($path);
        }, 'import_arrets_');
    }

    public function importCars()
    {
        $this->handleUploadAndImport('file', function($path) {
            return $this->importer->importCars($path);
        }, 'import_cars_');
    }

    public function importAssignments()
    {
        $this->handleUploadAndImport('file', function($path) {
            return $this->importer->importAssignments($path);
        }, 'import_assignments_');
    }
}
