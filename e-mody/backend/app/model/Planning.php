<?php

require_once __DIR__ . '/BaseModel.php';

class Planning extends BaseModel
{
    protected string $table = 'planning_personnel';
    protected bool $timestamps = true;

    /**
     * Trouve un planning par personnel et date
     */
    public function findByPersonnelAndDate(int $personnelId, string $date): ?array
    {
        $sql = "SELECT * FROM {$this->table} WHERE id_personnel = ? AND date_jour = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$personnelId, $date]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    /**
     * Met à jour l'heure de sortie d'un planning
     */
    public function updateSortie(int $planningId, string $heureSortie): bool
    {
        $sql = "UPDATE {$this->table} SET heure_sortie = ? WHERE id = ?";
        $stmt = $this->db->prepare($sql);
        return $stmt->execute([$heureSortie, $planningId]);
    }

    /**
     * Crée un nouveau planning
     */
    public function createPlanning(array $data): int
    {
        return $this->create($data);
    }

    /**
     * Récupère le prochain ordre disponible pour un axe
     */
    public function getNextOrdreForAxe(int $axeId): int
    {
        $sql = "SELECT COALESCE(MAX(ordre), 0) + 1 as next_ordre 
                FROM arrets 
                WHERE id_axe = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$axeId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($result['next_ordre'] ?? 1);
    }

    /**
     * Trouve un arrêt par adresse et axe
     */
    public function findByAdresseAndAxe(string $adresse, int $axeId): ?array
    {
        $sql = "SELECT * FROM arrets WHERE nom_arret = ? AND id_axe = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$adresse, $axeId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }
}