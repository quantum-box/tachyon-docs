# IaC

## PlatformManifesetTemplate

Operator作成する際に、必要な情報を定義できる

```yaml
kind: PlatformTemplate
apiVersion: apps.tachy.one/v1alpha
metadata:
  name: platform-manifest-template
spec:
  providers:
    - provider: stripe
      name: stripe-dev
      apiKey: USER_DEFINED
    - provider: hubspot
      name: hubspot-dev
      apiKey: USER_DEFINED
  serviceAccounts:
    - name: service-account-1
      policies:
        - order:ListAllProducts
        - order:GetQuote
        - order:CreateQuote
        - order:CreateClient
        - order:IssueQuote
        - order:GetClient
        - order:UpdateQuote
        - order:SelfServiceOrder
        - order:CompleteOrder
        - order:RegisterShippingDestination
        - delivery:CreateShippingDestination
      resources:
        - trn:tachyon-apps:library:global:self:quote:*
        - trn:tachyon-apps:library:global:self:products:*
        - trn:tachyon-apps:library:global:self:client:*
```

```yaml
apiVersion: apps.tachy.one/v1alpha
kind: ManifestTemplate
metadata:
  name: manifest-template
  platform_id: tn_01jjcqr63zm90gaerzn1ykce0f
spec:
  providers:
    - name: stripe-dev
      provider: stripe
      api_key: USER_DEFINED
    - provider: stripe
      api_key: USER_DEFINED
    - name: hubspot
      provider: hubspot
      api_key: USER_DEFINED
    - name: square
      provider: square
      api_key: USER_DEFINED
```


## ProjectConfig

```yaml
apiVersion: apps.tachy.one/v1alpha
kind: ProjectConfig
metadata:
  name: bakuure-quantum-box-sandbox
  tenantId: tn_01hy91qw3362djx6z9jerr34v4
spec:
  providers:
    - name: keycloak
      config:
        realms: tachyon
        url: http://localhost:30081
        user: admin
        password: admin
    - name: hubspot
      config:
        api_key: pat-na1-f20f533c-21e8-49d6-8297-7
    - name: stripe
      config:
        api_key: >-
          sk_test_51L1umOC0lHhtcjtrvlLvUX16pXgdLlhwihNaBNnvB5htD5yGFu
    - name: square
      config:
        api_key: EAAAlz2R5glddXDvSc1cFAGY_DNtjxRl340lo7earK

```
