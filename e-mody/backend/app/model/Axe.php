<?php
require_once __DIR__ . '/BaseModel.php';

class Axe extends BaseModel
{
    protected string $table = 'axes';
    protected string $primaryKey = 'id';
    protected bool $timestamps = true;
    
    public function __construct(?\PDO $pdo = null)
    {
        parent::__construct($pdo);
    }

    public function findByNom(string $nomAxe): ?array
    {
        return $this->firstWhere(['nom_axe' => $nomAxe]);
    }
}