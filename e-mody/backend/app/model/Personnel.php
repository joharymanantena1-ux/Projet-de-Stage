<?php
require_once __DIR__ . '/BaseModel.php';

class Personnel extends BaseModel
{
    protected string $table = 'personnels';
    protected bool $timestamps = true;

    public function findByMatricule(string $matricule): ?array
    {
        return $this->firstWhere(['matricule' => $matricule]);
    }

    /**
     * Récupère le personnel avec les informations de l'arrêt assigné
     */
    public function getWithArret(array $conditions = [], array $options = []): array
    {
        $sql = "SELECT 
                    p.*,
                    a.nom_arret,
                    a.latitude as arret_latitude,
                    a.longitude as arret_longitude
                FROM {$this->table} p
                LEFT JOIN arrets a ON p.id_arret = a.id";

        $where = '';
        $params = [];

        if (!empty($conditions)) {
            $whereParts = [];
            foreach ($conditions as $key => $value) {
                if (is_int($key)) {
                    $whereParts[] = $value;
                } else {
                    $whereParts[] = "$key = ?";
                    $params[] = $value;
                }
            }
            $where = ' WHERE ' . implode(' AND ', $whereParts);
        }

        $sql .= $where;

        if (isset($options['order'])) {
            $sql .= " ORDER BY " . $options['order'];
        } else {
            $sql .= " ORDER BY p.nom, p.prenom";
        }

        if (isset($options['limit'])) {
            $sql .= " LIMIT " . (int)$options['limit'];
            if (isset($options['offset'])) {
                $sql .= " OFFSET " . (int)$options['offset'];
            }
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}