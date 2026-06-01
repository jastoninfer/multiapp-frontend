# Multiapp Keycloak Theme

This folder contains a custom Keycloak login theme for the hosted login page.

Install it by copying `keycloak-theme/multiapp` into the Keycloak server themes directory:

```bash
cp -R keycloak-theme/multiapp /opt/keycloak/themes/
```

Then select it in the Keycloak admin console:

1. Open the `multiapp` realm.
2. Go to `Realm settings`.
3. Open the `Themes` tab.
4. Set `Login theme` to `multiapp`.
5. Save.

For container deployments, mount the folder into the image or container at:

```text
/opt/keycloak/themes/multiapp
```

If theme caching is enabled, restart Keycloak after updating files. In local development, disabling theme caches makes CSS iteration faster.
