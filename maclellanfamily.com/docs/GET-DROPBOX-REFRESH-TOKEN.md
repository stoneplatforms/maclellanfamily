# How to Get a Dropbox Refresh Token

## Quick Option: Use Access Token (Temporary)

You can use your access token directly for now:

1. Add to `.env.local`:
```bash
DROPBOX_ACCESS_TOKEN=sl.u.AGIY_6PIpJD8gBlFO09PGISgNKJ6WVMhBym2MfJnp9XZpUaDWxskqKXr8PVYpwBN_-aiEAe05IOcNemjxHOoZmXXHwQZsGoypSOoGLzlrx5ZLIqvYOUisqprkJom_40tZqo4rdr75Qp4JWwGkilU4m2vy4wZTF6l1so8sjK4nPWxkDqnvu2OVcmnQhDyDkk54FLdJ8JklwX6DVfaI08FDDA_jOYEv3eYfzaG-0iXqplOhJ0BTUgtviDPh-JoH4Yov3Evdx2-eSxcyVhuS8H2ZxrPuyRoDC845wqCjH-PXmGyLUXnwt6DDwG78eJozI6wn0ZfN-IRBjqFUJJyAgBOL5D0C21DgA9Vz7B-qdIFX7x71U-J1YxMnc9qSiPpmlXiPZY61oTnQv1UL9Wdt-5W2wYsugamDgzOHNJvypZMm-CdjIfjAg2zmcejs6dH1S4HvDgky7uK51DZH8gZIrAqKEpwrZboZVbwfYftH7uvIsjcKvygIfrpu-oyjtB9CMLmU5pprsLNKlH1XcTgOMxDFMXBkozVd3Zbv-rhzBWOhDAcu3I8DS-27LFB1g8atlhVR6o1yheUztDK_v9nyHAtmkfsSEJmPsIG6y9xNCnv4GQhSL47JWXbQrBsTrCyuwbnrVEhq1uTkhpizi05os1nPo5ycaHjZ-sCsMXdVQ6WeJMKEA7ysXWcyUDH4BMBXvH5ZP6aFx80xaJ1H07-YiCzdST-YaQcM_tg0AnJNjuDqPl2mnXG_0Gr0yxy7YNaaVqIsfip22sFreJVBMSxzqyHuIKP-vk_g1O-y_2A_fyP69UuBfZpfze40tWRzy626lC0ylYbnF7HXQMYje1kagh_38VIpx5JLnN9OhoxEo2SkTZ9UX_fdnrwsAWoEjcqESv0rzhTXReNWVE11phtSk7pWtk9cD47IPiABdxXSIFOZur7Tqyxk9oAeXAng8sp8EUhscIILfGohUtTNnFi_wHiHctBxw_SzJ8CEhaQjo8iUOnBR3-A1AZB4X0nX7JN11fxpETRIV_vqNwnU7lwgERlRMMInKEqm7othHZ6DvDKODjkDToY5eD9hQ1SgeAaVdvha5TGgec-5P9xKKVocmH_0C4eP8xAS2fVr7zk7dV-Yr0zrEU1AEyJguPx0WGKdCNRKSDCSiAAiyahA_XiMfGljRleK_dG-ywfYZd7srRAYidBJUKWw4X4a7MGUKR23OQkMsTuFWtlqedYDhLBELDsBiYWWd1YWaQmKnv-tcN1nnk_fSyc_avINyg4Otb0OlPmDxrbCjuQ7sldaAr7HmmdCZWRQOQQj78vbsVOpGYXhHRnKNPgc_SHvWPS2qLCfYwVW6pkzZAyRCkyhCOr80BGGhPh79XmQbHOm004Mz7QOx4AHsbNTjgeIll8uXJTLrfWznXOKTMAMlowLD-0cF51_3Q
```

**Note:** Access tokens expire (usually after 4 hours). For production, use a refresh token.

## Get Refresh Token (Recommended for Production)

### Method 1: Using Dropbox App Console (Easiest)

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Select your `stone-development` app
3. Go to **Settings** → **OAuth 2**
4. Scroll to **Generated access token**
5. Copy the token (this is a short-lived access token)
6. Use an OAuth flow tool to exchange it for a refresh token

### Method 2: Use OAuth Flow Tool

Use a tool like [this one](https://dropbox.github.io/dropbox-api-v2-explorer/) or write a small script:

```javascript
// Get refresh token script
const Dropbox = require('dropbox');
const fetch = require('cross-fetch');

const dropbox = new Dropbox({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
  fetch
});

// Use the authorization URL to get code, then exchange for refresh token
// See: https://www.dropbox.com/developers/reference/oauth-guide
```

### Method 3: Use Your Access Token to Generate Refresh Token

Since you have an access token, you can use it temporarily. The code now supports both!

## Update Your .env.local

Add this line:
```bash
DROPBOX_ACCESS_TOKEN=sl.u.AGIY_6PIpJD8gBlFO09PGISgNKJ6WVMhBym2MfJnp9XZpUaDWxskqKXr8PVYpwBN_-aiEAe05IOcNemjxHOoZmXXHwQZsGoypSOoGLzlrx5ZLIqvYOUisqprkJom_40tZqo4rdr75Qp4JWwGkilU4m2vy4wZTF6l1so8sjK4nPWxkDqnvu2OVcmnQhDyDkk54FLdJ8JklwX6DVfaI08FDDA_jOYEv3eYfzaG-0iXqplOhJ0BTUgtviDPh-JoH4Yov3Evdx2-eSxcyVhuS8H2ZxrPuyRoDC845wqCjH-PXmGyLUXnwt6DDwG78eJozI6wn0ZfN-IRBjqFUJJyAgBOL5D0C21DgA9Vz7B-qdIFX7x71U-J1YxMnc9qSiPpmlXiPZY61oTnQv1UL9Wdt-5W2wYsugamDgzOHNJvypZMm-CdjIfjAg2zmcejs6dH1S4HvDgky7uK51DZH8gZIrAqKEpwrZboZVbwfYftH7uvIsjcKvygIfrpu-oyjtB9CMLmU5pprsLNKlH1XcTgOMxDFMXBkozVd3Zbv-rhzBWOhDAcu3I8DS-27LFB1g8atlhVR6o1yheUztDK_v9nyHAtmkfsSEJmPsIG6y9xNCnv4GQhSL47JWXbQrBsTrCyuwbnrVEhq1uTkhpizi05os1nPo5ycaHjZ-sCsMXdVQ6WeJMKEA7ysXWcyUDH4BMBXvH5ZP6aFx80xaJ1H07-YiCzdST-YaQcM_tg0AnJNjuDqPl2mnXG_0Gr0yxy7YNaaVqIsfip22sFreJVBMSxzqyHuIKP-vk_g1O-y_2A_fyP69UuBfZpfze40tWRzy626lC0ylYbnF7HXQMYje1kagh_38VIpx5JLnN9OhoxEo2SkTZ9UX_fdnrwsAWoEjcqESv0rzhTXReNWVE11phtSk7pWtk9cD47IPiABdxXSIFOZur7Tqyxk9oAeXAng8sp8EUhscIILfGohUtTNnFi_wHiHctBxw_SzJ8CEhaQjo8iUOnBR3-A1AZB4X0nX7JN11fxpETRIV_vqNwnU7lwgERlRMMInKEqm7othHZ6DvDKODjkDToY5eD9hQ1SgeAaVdvha5TGgec-5P9xKKVocmH_0C4eP8xAS2fVr7zk7dV-Yr0zrEU1AEyJguPx0WGKdCNRKSDCSiAAiyahA_XiMfGljRleK_dG-ywfYZd7srRAYidBJUKWw4X4a7MGUKR23OQkMsTuFWtlqedYDhLBELDsBiYWWd1YWaQmKnv-tcN1nnk_fSyc_avINyg4Otb0OlPmDxrbCjuQ7sldaAr7HmmdCZWRQOQQj78vbsVOpGYXhHRnKNPgc_SHvWPS2qLCfYwVW6pkzZAyRCkyhCOr80BGGhPh79XmQbHOm004Mz7QOx4AHsbNTjgeIll8uXJTLrfWznXOKTMAMlowLD-0cF51_3Q
```

The code will automatically use the access token if `DROPBOX_ACCESS_TOKEN` is set, otherwise it will use the refresh token.

