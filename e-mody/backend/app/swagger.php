<?php

header('Access-Control-Allow-Origin: *');
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Docs API - e-mody (Swagger UI)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css"/>
  <style>
    body { margin:0; padding:0; }
    #swagger-ui { height:100vh; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      const specUrl = './api/openapi.json';
      const ui = SwaggerUIBundle({
        url: specUrl,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis
        ],
        layout: "BaseLayout"
      });
      window.ui = ui;
    };
  </script>
</body>
</html>
