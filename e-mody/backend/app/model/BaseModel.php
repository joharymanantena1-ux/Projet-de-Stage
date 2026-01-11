<?php
    require_once __DIR__ . '/../config/Database.php';

    class BaseModel
    {
        protected \PDO $db;
        protected string $table = '';   
        protected string $primaryKey = 'id';
        protected bool $timestamps = false;   
        protected bool $softDelete = false; 
        protected string $deletedAtColumn = 'deleted_at';

        public function __construct(?\PDO $pdo = null)
        {
            if ($pdo instanceof \PDO) {
                $this->db = $pdo;
            } else {
                $this->db = (new Database())->getConnection();
            }

            if (empty($this->table)) {
                throw new \RuntimeException("Propriété \$table non définie dans " . static::class);
            }
        }

        public function beginTransaction() { return $this->db->beginTransaction(); }
        public function commit() { return $this->db->commit(); }
        public function rollback() { return $this->db->rollBack(); }


        public function all(array $conditions = [], array $options = []): array
        {
            $cols = $options['columns'] ?? '*';
            $order = $options['order'] ?? '';
            $limit = $options['limit'] ?? null;
            $offset = $options['offset'] ?? null;

            $sql = "SELECT {$cols} FROM {$this->table}";
            [$whereSql, $params] = $this->buildWhere($conditions);
            if ($whereSql !== '') $sql .= " WHERE " . $whereSql;
            if ($this->softDelete && $whereSql === '') {
                $sql .= " WHERE {$this->table}.{$this->deletedAtColumn} IS NULL";
            } elseif ($this->softDelete && $whereSql !== '') {
                $sql .= " AND {$this->table}.{$this->deletedAtColumn} IS NULL";
            }

            if ($order) $sql .= " ORDER BY " . $order;
            if ($limit !== null) $sql .= " LIMIT " . intval($limit);
            if ($offset !== null) $sql .= " OFFSET " . intval($offset);

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        public function find($id, string $columns = '*'): ?array
        {
            $sql = "SELECT {$columns} FROM {$this->table} WHERE {$this->primaryKey} = :id";
            if ($this->softDelete) $sql .= " AND {$this->deletedAtColumn} IS NULL";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            return $row === false ? null : $row;
        }

        public function firstWhere(array $conditions): ?array
        {
            $rows = $this->all($conditions, ['limit' => 1]);
            return $rows[0] ?? null;
        }

        public function count(array $conditions = []): int
        {
            $sql = "SELECT COUNT(*) as cnt FROM {$this->table}";
            [$whereSql, $params] = $this->buildWhere($conditions);
            if ($whereSql !== '') $sql .= " WHERE " . $whereSql;
            if ($this->softDelete) {
                $sql .= ($whereSql === '' ? " WHERE " : " AND ") . "{$this->deletedAtColumn} IS NULL";
            }

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return (int) $stmt->fetchColumn();
        }


        public function create(array $data)
        {
            if (empty($data)) {
                throw new \InvalidArgumentException('Aucune donnée fournie pour create()');
            }

            if ($this->timestamps) {
                $now = date('Y-m-d H:i:s');
                if (!isset($data['created_at'])) $data['created_at'] = $now;
                if (!isset($data['updated_at'])) $data['updated_at'] = $now;
            }

            $fields = array_keys($data);
            $placeholders = array_map(fn($f) => ':' . $f, $fields);

            $sql = sprintf(
                "INSERT INTO %s (%s) VALUES (%s)",
                $this->table,
                implode(', ', $fields),
                implode(', ', $placeholders)
            );

            $stmt = $this->db->prepare($sql);
            foreach ($data as $k => $v) $stmt->bindValue(':' . $k, $v);
            $ok = $stmt->execute();

            if (!$ok) {
                $err = $stmt->errorInfo();
                throw new \RuntimeException("Insert failed: {$err[2]}");
            }

            return $this->db->lastInsertId();
        }

        public function update($id, array $data): int
        {
            if (empty($data)) {
                throw new \InvalidArgumentException('Aucune donnée fournie pour update()');
            }

            if ($this->timestamps) {
                $data['updated_at'] = date('Y-m-d H:i:s');
            }

            // retirer la clé primaire si fournie
            if (isset($data[$this->primaryKey])) unset($data[$this->primaryKey]);

            $sets = [];
            foreach (array_keys($data) as $col) {
                $sets[] = "{$col} = :{$col}";
            }

            $sql = sprintf(
                "UPDATE %s SET %s WHERE %s = :__pk",
                $this->table,
                implode(', ', $sets),
                $this->primaryKey
            );

            $stmt = $this->db->prepare($sql);
            foreach ($data as $k => $v) $stmt->bindValue(':' . $k, $v);
            $stmt->bindValue(':__pk', $id);
            $stmt->execute();
            return $stmt->rowCount();
        }

        public function delete($id): int
        {
            if ($this->softDelete) {
                $now = date('Y-m-d H:i:s');
                $sql = "UPDATE {$this->table} SET {$this->deletedAtColumn} = :now WHERE {$this->primaryKey} = :id";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([':now' => $now, ':id' => $id]);
                return $stmt->rowCount();
            } else {
                $sql = "DELETE FROM {$this->table} WHERE {$this->primaryKey} = :id";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([':id' => $id]);
                return $stmt->rowCount();
            }
        }

        protected function buildWhere(array $conditions): array
        {
            if (empty($conditions)) return ['', []];

            $parts = [];
            $params = [];

            foreach ($conditions as $key => $value) {
                // si c'est une clé numérique, on considère que $value est une condition brute
                if (is_int($key)) {
                    $parts[] = "($value)";
                    continue;
                }

                // si la clé contient un opérateur (ex: "age > ?")
                if (preg_match('/\?$/', (string)$key)) {
                    $parts[] = "($key)";
                    if (is_array($value)) {
                        $params = array_merge($params, $value);
                    } else {
                        $params[] = $value;
                    }
                    continue;
                }

                // sinon simple égalité
                $paramName = ':' . preg_replace('/[^a-z0-9_]/i', '_', $key);
                $parts[] = "{$key} = {$paramName}";
                $params[$paramName] = $value;
            }

            return [implode(' AND ', $parts), $params];
        }

        public function allDistinct(array $conditions = [], array $options = []): array
        {
            $cols = $options['columns'] ?? '*';
            $order = $options['order'] ?? '';
            $limit = $options['limit'] ?? null;
            $offset = $options['offset'] ?? null;
            $distinct = $options['distinct'] ?? false;

            $sql = "SELECT ";
            if ($distinct) {
                $sql .= "DISTINCT ";
            }
            $sql .= "{$cols} FROM {$this->table}";
            
            [$whereSql, $params] = $this->buildWhere($conditions);
            if ($whereSql !== '') $sql .= " WHERE " . $whereSql;
            if ($this->softDelete && $whereSql === '') {
                $sql .= " WHERE {$this->table}.{$this->deletedAtColumn} IS NULL";
            } elseif ($this->softDelete && $whereSql !== '') {
                $sql .= " AND {$this->table}.{$this->deletedAtColumn} IS NULL";
            }

            if ($order) $sql .= " ORDER BY " . $order;
            if ($limit !== null) $sql .= " LIMIT " . intval($limit);
            if ($offset !== null) $sql .= " OFFSET " . intval($offset);

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

    }
