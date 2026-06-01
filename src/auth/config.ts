export interface AppConfig {
  apiBaseUrl: string;
  keycloakUrl: string;
  keycloakRealm: string;
  keycloakClientId: string;
}

export const appConfig: AppConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8081",
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080",
  keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM || "multiapp",
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "multiapp-web"
};

export function hasOidcConfig(config = appConfig) {
  return Boolean(config.keycloakUrl && config.keycloakRealm && config.keycloakClientId);
}
