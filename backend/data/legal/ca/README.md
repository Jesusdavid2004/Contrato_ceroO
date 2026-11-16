# Extra CA certificates for the legal radar

`letsencrypt-gen-y-chain.pem` holds two **public** CA certificates (no secrets):

- Let's Encrypt intermediate `YR1`
- `ISRG Root YR` cross-signed by `ISRG Root X1`

`www.funcionpublica.gov.co` (Gestor Normativo) sends an incomplete or wrong
intermediate chain, so Node cannot build a trusted path although browsers and
curl (which fetch missing intermediates) can. The radar keeps full TLS
verification and only *adds* these certificates to the trust store for its own
requests. Remove the file once the site fixes its chain.

Intermediate YR1 expires 2028-09-02; refresh from
https://letsencrypt.org/certs/ if verification starts failing.
