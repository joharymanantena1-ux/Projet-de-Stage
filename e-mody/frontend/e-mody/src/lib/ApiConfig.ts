
export default class ApiConfig {
  private static baseUrl: string =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE_URL
      ? process.env.NEXT_PUBLIC_API_BASE_URL
      : 'http://localhost/Projet-Stage/e-mody/backend/app/api';

  public static getBaseUrl(): string {
    return ApiConfig.baseUrl;
  }

  public static setBaseUrl(url: string) {
    ApiConfig.baseUrl = url;
  }
}
