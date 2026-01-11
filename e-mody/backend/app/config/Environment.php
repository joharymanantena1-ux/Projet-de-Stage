<?php

class Environment
{
    private static $loaded = false;
    private static $variables = [];

    public static function load($path = null)
    {
        if (self::$loaded) {
            return;
        }

        if ($path === null) {
            $path = __DIR__ . '/../.env';
        }

        if (!file_exists($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) {
                continue;
            }

            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value);

            // Supprimer les guillemets
            $value = trim($value, '"\'');
            
            self::$variables[$name] = $value;
            $_ENV[$name] = $value;
            putenv("$name=$value");
        }

        self::$loaded = true;
    }

    public static function get($key, $default = null)
    {
        self::load();
        
        if (isset(self::$variables[$key])) {
            return self::$variables[$key];
        }
        
        return getenv($key) ?: $default;
    }
}

// Charger automatiquement
Environment::load();