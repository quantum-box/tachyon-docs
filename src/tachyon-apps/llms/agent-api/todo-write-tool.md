# TodoWrite Tool

## Overview

The TodoWrite tool provides task list management functionality for the Tachyon Agent API, enabling LLM agents to break down complex tasks, track progress, and communicate execution status to users in real-time. It is inspired by and compatible with Claude Code's TodoWrite tool.

## Use Cases

- **Task Planning**: Break down complex multi-step tasks into smaller, trackable items
- **Progress Visibility**: Show users what the agent is currently working on
- **Status Communication**: Communicate completion status for each subtask
- **Execution Context**: Maintain awareness of overall progress through long-running operations

## Architecture

### Component Structure

```
packages/llms/
├── domain/src/
│   ├── todo_item.rs          # TodoItem entity & TodoStatus enum
│   ├── repository/
│   │   └── todo_repository.rs # TodoRepository trait
│   └── service/
│       └── todo_tool.rs      # TodoWriteTool implementation
├── src/
│   ├── usecase/
│   │   ├── list_todos.rs     # ListTodos usecase
│   │   └── update_todos.rs   # UpdateTodos usecase
│   └── adapter/
│       └── gateway/
│           └── sqlx_todo_repository.rs  # MySQL persistence
└── migrations/
    ├── 20260109000000_create_chatroom_todos.up.sql
    └── 20260110000000_expand_chatroom_todos_ids.up.sql
```

### Key Components

- **TodoItem**: Domain entity representing a single task with status tracking
- **TodoStatus**: Enum with three states: `Pending`, `InProgress`, `Completed`
- **TodoWriteTool**: Tool implementation following the standard Tool trait
- **TodoRepository**: Persistence layer for chatroom-scoped todos
- **ListTodos/UpdateTodos**: Clean Architecture usecases for CRUD operations

## Data Model

### TodoItem Entity

```rust
pub struct TodoItem {
    id: TodoItemId,           // ULID with "td_" prefix
    chatroom_id: ChatRoomId,  // Scoped to chatroom
    content: String,          // Imperative form: "Run tests"
    active_form: String,      // Present continuous: "Running tests"
    status: TodoStatus,       // pending | in_progress | completed
    position: i32,            // Display order
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}
```

### TodoStatus Enum

```rust
pub enum TodoStatus {
    Pending,      // Not started
    InProgress,   // Currently executing
    Completed,    // Finished
}
```

### Database Schema

```sql
CREATE TABLE tachyon_apps_llms.chatroom_todos (
    id CHAR(29) NOT NULL PRIMARY KEY,           -- ULID with "td_" prefix
    chatroom_id CHAR(29) NOT NULL,              -- Scoped to chatroom
    content VARCHAR(500) NOT NULL,               -- Task description (imperative)
    active_form VARCHAR(500) NOT NULL,           -- Execution description (continuous)
    status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
    position INT NOT NULL DEFAULT 0,             -- Display order
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_chatroom_todos_chatroom_id (chatroom_id),
    INDEX idx_chatroom_todos_status (status),
    INDEX idx_chatroom_todos_chatroom_position (chatroom_id, position)
);
```

## Tool Specification

### Tool Definition

```json
{
  "name": "TodoWrite",
  "description": "Create and manage a structured task list for tracking progress. Use this tool to plan complex tasks, track progress, and show the user what you're working on.",
  "parameters": {
    "type": "object",
    "properties": {
      "todos": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "content": {
              "type": "string",
              "minLength": 1,
              "description": "Task description in imperative form (e.g., 'Run tests')"
            },
            "activeForm": {
              "type": "string",
              "minLength": 1,
              "description": "Task description in present continuous form (e.g., 'Running tests')"
            },
            "status": {
              "type": "string",
              "enum": ["pending", "in_progress", "completed"]
            }
          },
          "required": ["content", "status", "activeForm"]
        }
      }
    },
    "required": ["todos"]
  }
}
```

### Usage Rules

1. **One task in progress**: Only one task should be `in_progress` at a time
2. **Immediate completion**: Mark tasks as `completed` immediately upon finishing
3. **Update before starting**: Mark task as `in_progress` before starting work
4. **Full replacement**: Each TodoWrite call replaces the entire todo list

## API Reference

### GraphQL API

#### Queries

```graphql
type Query {
  chatroom_todos(chatroom_id: ID!): [ChatroomTodo!]!
}

type ChatroomTodo {
  id: ID!
  chatroom_id: ID!
  content: String!
  active_form: String!
  status: TodoStatus!
  position: Int!
  created_at: DateTime!
  updated_at: DateTime!
}

enum TodoStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}
```

#### Mutations

```graphql
type Mutation {
  updateChatroomTodos(input: UpdateChatroomTodosInput!): UpdateChatroomTodosPayload!
}

input UpdateChatroomTodosInput {
  chatroom_id: ID!
  todos: [TodoItemInput!]!
}

input TodoItemInput {
  content: String!
  active_form: String!
  status: TodoStatus!
}

type UpdateChatroomTodosPayload {
  todos: [ChatroomTodo!]!
}
```

### REST API

TodoWrite is primarily exposed through the Agent API tool mechanism and does not have a dedicated REST endpoint. Tool calls are handled through the Agent execution flow.

## Frontend Integration

### React Component

Location: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chatrooms/[chatroom_id]/agent-chat/page.tsx`

The todo list is displayed in the Control Panel sidebar with real-time updates:

```tsx
<div className="space-y-2">
  {todos.map((todo) => (
    <div key={todo.id} className="flex items-start gap-2">
      <StatusIcon status={todo.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {todo.status === 'in_progress' ? todo.active_form : todo.content}
        </p>
      </div>
    </div>
  ))}
</div>
```

### GraphQL Query

```typescript
import { graphql } from '@/gen/graphql'

export const CHATROOM_TODOS_QUERY = graphql(`
  query ChatroomTodos($chatroomId: ID!) {
    chatroom_todos(chatroom_id: $chatroomId) {
      id
      content
      active_form
      status
      position
      created_at
      updated_at
    }
  }
`)
```

## Usage Examples

### Example 1: Planning a Multi-Step Task

**Tool Input:**

```json
{
  "todos": [
    {
      "content": "Read configuration file",
      "activeForm": "Reading configuration file",
      "status": "in_progress"
    },
    {
      "content": "Parse YAML content",
      "activeForm": "Parsing YAML content",
      "status": "pending"
    },
    {
      "content": "Validate schema",
      "activeForm": "Validating schema",
      "status": "pending"
    },
    {
      "content": "Write output file",
      "activeForm": "Writing output file",
      "status": "pending"
    }
  ]
}
```

**Tool Result:**

```json
{
  "success": true,
  "count": 4
}
```

### Example 2: Updating Progress

After completing the first task:

```json
{
  "todos": [
    {
      "content": "Read configuration file",
      "activeForm": "Reading configuration file",
      "status": "completed"
    },
    {
      "content": "Parse YAML content",
      "activeForm": "Parsing YAML content",
      "status": "in_progress"
    },
    {
      "content": "Validate schema",
      "activeForm": "Validating schema",
      "status": "pending"
    },
    {
      "content": "Write output file",
      "activeForm": "Writing output file",
      "status": "pending"
    }
  ]
}
```

### Example 3: Task Completion

All tasks completed:

```json
{
  "todos": [
    {
      "content": "Read configuration file",
      "activeForm": "Reading configuration file",
      "status": "completed"
    },
    {
      "content": "Parse YAML content",
      "activeForm": "Parsing YAML content",
      "status": "completed"
    },
    {
      "content": "Validate schema",
      "activeForm": "Validating schema",
      "status": "completed"
    },
    {
      "content": "Write output file",
      "activeForm": "Writing output file",
      "status": "completed"
    }
  ]
}
```

## Configuration

### Tool Registration

The TodoWrite tool is automatically registered in the Agent API tool executor:

```rust
// In packages/llms/src/agent/tool/mod.rs
let todo_tool = TodoWriteTool::new(todo_repository.clone());
tools.insert("TodoWrite", Arc::new(todo_tool));
```

### Chatroom ID Injection

The `chatroomId` is automatically injected during tool execution and does not need to be provided by the LLM:

```rust
// In StreamCompletionChat usecase
if tool_name == "TodoWrite" {
    params["chatroomId"] = json!(chatroom_id);
}
```

### Permissions

Two new actions were added to the auth system:

- `llms:ListChatroomTodos` - Read access to todos
- `llms:UpdateChatroomTodos` - Write access to todos

These are included in standard policies like `TachyonFullAccess` and `AdminPolicy`.

## Performance Characteristics

- **Tool Execution**: < 100ms for typical todo updates
- **Database Operations**: Single transaction for batch updates
- **Real-time Updates**: Polling-based refresh in frontend (configurable interval)
- **Memory**: O(n) where n = number of todos per chatroom (typically < 20)

## Limitations

- **Scope**: Todos are scoped to a single chatroom and not shared across sessions
- **Persistence**: Todos are persisted to database but cleared when chatroom is deleted
- **Concurrent Updates**: Last-write-wins semantics (full replacement on each update)
- **Max Todos**: No hard limit, but UI displays up to ~20 items comfortably

## Testing

### Unit Tests

Location: `packages/llms/domain/src/todo_item.rs`

```rust
#[test]
fn test_status_transitions() {
    let item = TodoItem::new(...);
    assert_eq!(item.status(), TodoStatus::Pending);

    item.update_status(TodoStatus::InProgress);
    assert_eq!(item.status(), TodoStatus::InProgress);

    item.update_status(TodoStatus::Completed);
    assert_eq!(item.status(), TodoStatus::Completed);
}
```

### Integration Tests

Manual testing confirmed via Playwright:

- TodoWrite tool_call/tool_result in agent execution logs
- Control Panel displaying updated todos
- Status transitions (pending → in_progress → completed)

### Storybook Stories

Location: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chatrooms/[chatroom_id]/agent-chat/todo-list.stories.tsx`

Stories cover:
- Empty state
- Single task
- Multiple tasks with mixed statuses
- All completed state

## Related Documentation

- [Agent Protocol Tool Call](./agent-protocol-tool-call.md) - Tool execution protocol
- [Tool Execution](./tool-execution.md) - Tool dispatcher implementation
- [Tool Jobs](./tool-jobs.md) - Background job execution
- Original Taskdoc: [`docs/src/tasks/completed/v0.30.0/implement-agent-todo-tool/`](../../../tasks/completed/v0.30.0/implement-agent-todo-tool/)

## Version History

- **v0.30.0** (2026-01-13): Initial implementation
  - TodoItem domain model
  - TodoRepository with MySQL persistence
  - TodoWriteTool with Claude Code compatibility
  - GraphQL API (queries and mutations)
  - Frontend Control Panel integration
  - Storybook stories and manual testing
