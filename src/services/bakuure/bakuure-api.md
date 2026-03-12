# bakuure api

```plantuml
hide method

entity Product {
  id
  name
  price
  quantity
  description
  images
}

entity ProductGroup { 
  id
  name
  products
  description
  images
}

entity Image {
  id
  url
  description
}

ProductGroup "1" *-- "many" Product
Product "1" *-- "many" Image
ProductGroup "1" *-- "many" Image
```
