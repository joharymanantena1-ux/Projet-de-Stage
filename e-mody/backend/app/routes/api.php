<?php

$base = '/Projet-Stage/e-mody/backend/app/api';

$router->get(   $base . '/users',         'UserController@index');

// routes spécifiques et littérales AVANT la route paramétrée
$router->post(  $base . '/users/login',    'UserController@login');
$router->post(  $base . '/users/logout',   'UserController@logout');
$router->get(   $base . '/users/me',       'UserController@me');

// route paramétrée en dernier
$router->get(   $base . '/users/{id}',    'UserController@show');  


// Vérification email avant inscription
$router->post($base . '/users/check-email', 'UserController@checkEmail');
$router->post($base . '/users/send-verification', 'UserController@sendVerificationCode');
$router->post($base . '/users/verify-code', 'UserController@verifyCode');
$router->post($base . '/users/register', 'UserController@register');

// Test de la configuration email
$router->get($base . '/users/test-email-config', 'UserController@testEmailConfig');


// Réinitialisation du mot de passe
$router->post($base . '/users/forgot-password', 'UserController@forgotPassword');
$router->post($base . '/users/verify-reset-code', 'UserController@verifyResetCode');
$router->post($base . '/users/reset-password', 'UserController@resetPassword');
// #################################


// Import existants
$router->post($base . '/import/personnels', 'ImportController@importPersonnels');
$router->post($base . '/import/axes', 'ImportController@importAxes');

// Nouveaux endpoints pour importer les autres CSV
$router->post($base . '/import/arrets', 'ImportController@importArrets');
$router->post($base . '/import/cars', 'ImportController@importCars');
$router->post($base . '/import/assignments', 'ImportController@importAssignments');

// CRUD Personnels
$router->get(   $base . '/personnels',           'PersonnelCtrl@listePersonnel');
$router->get(   $base . '/personnels/{id}',      'PersonnelCtrl@showPersonnel');
$router->post(  $base . '/personnels',           'PersonnelCtrl@createPersonnel');
$router->put(   $base . '/personnels/{id}',      'PersonnelCtrl@updatePersonnel');
$router->patch( $base . '/personnels/{id}',      'PersonnelCtrl@updatePersonnel');
$router->delete($base . '/personnels/{id}',      'PersonnelCtrl@deletePersonnel');


// CRUD Axes
$router->get(   $base . '/axes',           'AxeCtrl@listeAxe');
$router->get(   $base . '/axes/{id}',      'AxeCtrl@showAxe');
$router->post(  $base . '/axes',           'AxeCtrl@createAxe');
$router->put(   $base . '/axes/{id}',      'AxeCtrl@updateAxe');
$router->patch( $base . '/axes/{id}',      'AxeCtrl@updateAxe');
$router->delete($base . '/axes/{id}',      'AxeCtrl@deleteAxe');


// CRUD Arrets
$router->get(   $base . '/arrets',         'ArretCtrl@listeArret');
$router->get(   $base . '/arrets/{id}',    'ArretCtrl@showArret');
$router->post(  $base . '/arrets',         'ArretCtrl@createArret');
$router->put(   $base . '/arrets/{id}',    'ArretCtrl@updateArret');
$router->patch( $base . '/arrets/{id}',    'ArretCtrl@updateArret');
$router->delete($base . '/arrets/{id}',    'ArretCtrl@deleteArret');

// CRUD Assignments
$router->get(   $base . '/assignments',           'AssignmentCtrl@listeAssignments');
$router->get(   $base . '/assignments/{id}',      'AssignmentCtrl@showAssignment');
$router->post(  $base . '/assignments',           'AssignmentCtrl@createAssignment');
$router->put(   $base . '/assignments/{id}',      'AssignmentCtrl@updateAssignment');
$router->patch( $base . '/assignments/{id}',      'AssignmentCtrl@updateAssignment');
$router->delete($base . '/assignments/{id}',      'AssignmentCtrl@deleteAssignment');

// Assignation simplifiée personnel → arrêt
$router->post(  $base . '/assign-personnel',      'AssignmentCtrl@assignPersonnelToArret');


$router->get(   $base . '/trajets',           'TrajetCtrl@listeTrajet');
$router->get(   $base . '/trajets/{id}',      'TrajetCtrl@showTrajet');
$router->post(  $base . '/trajets',           'TrajetCtrl@createTrajet');
// endpoint utile pour simuler un trajet sans persister
$router->post(  $base . '/trajets/simulate',  'TrajetCtrl@simulateRoute');

// NOUVELLES ROUTES OSRM
$router->post(  $base . '/trajets/update-route',      'TrajetCtrl@updateTrajetRoute');
$router->post(  $base . '/trajets/update-all-routes', 'TrajetCtrl@updateAllRoutes');
$router->post(  $base . '/trajets/generate-test',     'TrajetCtrl@generateTestTrajets');

$router->get($base . '/reports/planning', 'ReportCtrl@plannedPersonnel');

$router->get($base . '/suivit', 'SuivitCtrl@getSuivitData');
$router->get($base . '/suivit/saved', 'SuivitCtrl@getSavedData');
$router->get($base . '/suivit/export', 'SuivitCtrl@getDetailedExport');
$router->get($base . '/suivit/months', 'SuivitCtrl@getAvailableMonths');
$router->get($base . '/suivit/test', 'SuivitCtrl@testQueries');

$router->put($base . '/suivit/update', 'SuivitCtrl@updateSuiviData');
$router->post($base . '/suivit/update', 'SuivitCtrl@updateSuiviData');

// MIGRATION OSRM (à exécuter une fois)
$router->post($base . '/trajets/migrate-osrm', 'TrajetCtrl@migrateAllTrajets');