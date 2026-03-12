# projects domain

```plantuml
title projects domain model

entity Pipeline {
    id
    name
    stages
}

entity Stage {
    id
    name
    orderNo
    items
}

entity Item {
    DataId
    ItemPropertyList
}

rectangle "Automation agg" {
    entity Automation {
        AutomationId
        Trigger
        currentPipeline
        nextPipeline
    }

    enum Trigger {
        Created
        Updated
        Deleted
    }
    Automation -> Trigger
}

Pipeline --> Stage
Stage --> Item
Automation --> Stage

```

