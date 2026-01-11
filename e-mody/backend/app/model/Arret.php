<?php
require_once __DIR__ . '/BaseModel.php';

class Arret extends BaseModel
{
    protected string $table = 'arrets';
    protected bool $timestamps = true;

    public function findByAdresseAndAxe(string $adresse, int $axeId): ?array
    {
        return $this->firstWhere([
            'nom_arret' => $adresse,
            'id_axe' => $axeId
        ]);
    }

    public function getNextOrdreForAxe(int $axeId): int
    {
        try {
            $sql = "SELECT MAX(ordre) as max_ordre FROM arrets WHERE id_axe = :id_axe";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([':id_axe' => $axeId]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            return ($result['max_ordre'] ?? 0) + 1;
        } catch (Exception $e) {
            return 1;
        }
    }
}