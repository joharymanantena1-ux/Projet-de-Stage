<?php
require_once __DIR__ . '/BaseModel.php';

class Car extends BaseModel
{
    protected string $table = 'cars';
    protected string $primaryKey = 'id';
    protected bool $timestamps = true;
    
    public function __construct(\PDO $pdo = null)
    {
        parent::__construct($pdo);
    }

    public function findAvailable(): ?array
    {
        $cars = $this->all(['disponible' => 1], ['limit' => 1]);
        return $cars[0] ?? null;
    }

    public function findByAxe($axeId): ?array
    {
        $sql = "SELECT * FROM {$this->table} WHERE nom_car LIKE :pattern LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':pattern' => "%AXE_$axeId%"]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    public function getCarsByAxePattern(): array
    {
        $cars = $this->all();
        $result = [];
        
        foreach ($cars as $car) {
            if (preg_match('/AXE_(\d+)/', $car['nom_car'], $matches)) {
                $axeId = $matches[1];
                $result[$axeId] = $car;
            }
        }
        
        return $result;
    }
}