<?php
class Router {
    private $routes = [];

    // Méthode générique d'ajout de route
    public function add($method, $path, $action) {
        $method = strtoupper($method);
        $path = '/' . trim($path, '/'); // normaliser
        $this->routes[$method][$path] = $action;
    }

    // Méthodes confort
    public function get($path, $action)    { $this->add('GET', $path, $action); }
    public function post($path, $action)   { $this->add('POST', $path, $action); }
    public function put($path, $action)    { $this->add('PUT', $path, $action); }
    public function delete($path, $action) { $this->add('DELETE', $path, $action); }
    public function patch($path, $action)  { $this->add('PATCH', $path, $action); }
    public function options($path, $action){ $this->add('OPTIONS', $path, $action); }

    // Dispatch de la requête
    public function dispatch($uri) {
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        
        if ($path !== '/') {
            $path = '/' . trim($path, '/');
        }

        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        if ($method !== 'GET') {
            $raw = file_get_contents('php://input');
            $payload = null;
            if ($raw !== false && strlen($raw) > 0) {
                $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
                if (stripos($contentType, 'application/json') !== false) {
                    $payload = json_decode($raw, true);
                } else {
                    parse_str($raw, $payload);
                }
            }
            $_REQUEST['payload'] = $payload;

            // ----------- DEBUG LOG -----------
            if (!is_dir(__DIR__ . '/../logs')) {
                mkdir(__DIR__ . '/../logs', 0777, true);
            }
            file_put_contents(
                __DIR__.'/../logs/debug_payload.txt',
                var_export([
                    'method'  => $method,
                    'ct'      => $_SERVER['CONTENT_TYPE'] ?? null,
                    'raw'     => $raw,
                    'payload' => $payload
                ], true) . "\n\n",
                FILE_APPEND
            );
            // ---------------------------------
        }

        $matched = $this->matchRoute($method, $path);
        if ($matched !== null) {
            list($action, $params) = $matched;
            return $this->callAction($action, $params);
        }

        if ($this->pathExistsForDifferentMethod($path)) {
            http_response_code(405);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Method Not Allowed']);
            return;
        }

        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Route not found']);
    }


    // Trouve une route et extrait les params (retourne [action, params] ou null)
    private function matchRoute($method, $path) {
        $routesForMethod = $this->routes[$method] ?? [];
        foreach ($routesForMethod as $route => $action) {
            $paramNames = [];
            $pattern = $this->buildPatternFromRoute($route, $paramNames);

            if (preg_match($pattern, $path, $matches)) {
                array_shift($matches);
                $params = $matches;
                return [$action, $params];
            }
        }
        return null;
    }

    // Vérifie si le même chemin existe pour une autre méthode (utilisé pour 405)
    private function pathExistsForDifferentMethod($path) {
        foreach ($this->routes as $method => $routesForMethod) {
            foreach ($routesForMethod as $route => $action) {
                $dummy = [];
                $pattern = $this->buildPatternFromRoute($route, $dummy);
                if (preg_match($pattern, $path)) {
                    return true;
                }
            }
        }
        return false;
    }

    // Construit le pattern regex à partir d'une route type "/api/users/{id}"
    // Remplit $paramNames par les noms capturés (si besoin)
    private function buildPatternFromRoute($route, array &$paramNames) {
        $paramNames = [];
        $parts = explode('/', trim($route, '/'));
        $regexParts = [];
        foreach ($parts as $part) {
            if (preg_match('/^\{([a-zA-Z0-9_]+)\}$/', $part, $m)) {
                $paramNames[] = $m[1];
                $regexParts[] = '([^/]+)';
            } elseif ($part === '') {
                // ignore
            } else {
                $regexParts[] = preg_quote($part, '#');
            }
        }
        $regex = '#^/' . implode('/', $regexParts) . '/?$#'; // autorise slash final
        return $regex;
    }

    // Appelle l'action de la forme "UserController@method"
    private function callAction($action, $params = []) {
        list($controller, $func) = explode('@', $action);
        $controllerFile = __DIR__ . "/../controllers/$controller.php";

        if (!file_exists($controllerFile)) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => "Controller file not found: $controllerFile"]);
            return;
        }

        require_once $controllerFile;

        if (!class_exists($controller)) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => "Controller class not found: $controller"]);
            return;
        }

        $ctrl = new $controller();

        if (!method_exists($ctrl, $func)) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => "Method $func not found in controller $controller"]);
            return;
        }

        // Appel de la méthode avec les params capturés (ex: id). Les controllers peuvent récupérer le payload via $_REQUEST['payload']
        return call_user_func_array([$ctrl, $func], $params);
    }
}
