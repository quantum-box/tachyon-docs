---
title: "CMSアプリケーションUIコンポーネント設計"
topics: ["cms", "UI", "components", "design system"]
type: "tech"
published: false
targetFiles: ["apps/cms/src/components"]
---

# CMSアプリケーションUIコンポーネント設計

このドキュメントでは、CMSアプリケーションのUIコンポーネント設計と実装アプローチについて説明します。

## 📐 デザインシステム

CMSアプリケーションは、一貫性のあるユーザーエクスペリエンスを提供するために、以下の原則に基づいたデザインシステムを採用しています：

1. **コンポーネントの階層化**: 粒度に応じた明確な階層構造
2. **再利用性**: DRY（Don't Repeat Yourself）原則の徹底
3. **アクセシビリティ**: WCAG準拠のアクセシブルなUI
4. **レスポンシブ設計**: 様々なデバイスとスクリーンサイズへの対応
5. **ダークモード対応**: 明示的なカラーシステム

## 🧩 コンポーネント階層

CMSのUIコンポーネントは、責務と粒度に応じて以下の階層に分類されています：

### 1. プリミティブコンポーネント
最小単位の再利用可能なUIコンポーネント

- **場所**: `src/components/ui/`
- **例**: Button, Input, Card, Dialog
- **特徴**: 
  - Radix UIをベースとした実装
  - スタイリングはTailwind CSSで統一
  - アクセシビリティを考慮した設計

### 2. 複合コンポーネント
プリミティブコンポーネントを組み合わせた特定の機能を持つコンポーネント

- **場所**: `src/components/[feature]/`
- **例**: RepositoryCard, ContentEditor, SearchBar
- **特徴**:
  - 特定のドメインロジックをカプセル化
  - プロップスによるデータ受け渡し
  - 表示とロジックの分離

### 3. レイアウトコンポーネント
ページ全体のレイアウトを担当するコンポーネント

- **場所**: `src/components/layout/`
- **例**: Header, Sidebar, Footer
- **特徴**:
  - ページ構造の一貫性を担保
  - レスポンシブデザインの実装
  - ナビゲーション機能の提供

### 4. ページコンポーネント
特定のルートに対応する完全なページを構成するコンポーネント

- **場所**: `src/app/*/page.tsx`
- **例**: RepositoriesPage, ContentEditorPage
- **特徴**:
  - データフェッチングとビジネスロジック
  - 状態管理
  - ユーザーフロー制御

## 🎨 スタイリングアプローチ

### Tailwind CSSの活用

CMSアプリケーションではTailwind CSSを主要なスタイリング手法として採用しています：

```tsx
// src/components/ui/button.tsx
export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
```

### スタイルの抽象化とカスタマイズ

再利用性と一貫性を高めるために、class-variance-authority（cva）を使用してコンポーネントのバリエーションを管理しています：

```tsx
// src/components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
```

### ダークモード対応

Tailwind CSSのダークモードサポートを活用して、ライト/ダークテーマの切り替えに対応しています：

```tsx
// themes.ts
export const lightTheme = {
  background: "bg-white",
  text: "text-gray-900",
  // ...他のカラー定義
};

export const darkTheme = {
  background: "bg-gray-900",
  text: "text-gray-100",
  // ...他のカラー定義
};

// 使用例
<div className={`${isDark ? darkTheme.background : lightTheme.background} ${isDark ? darkTheme.text : lightTheme.text}`}>
  コンテンツ
</div>
```

## 📚 Storybookによるコンポーネント管理

CMSアプリケーションでは、UIコンポーネントの開発と文書化にStorybookを活用しています：

### ストーリーの実装例

```tsx
// src/components/ui/button.stories.tsx
import { Button } from "./button";

export default {
  title: "UI/Button",
  component: Button,
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"]
    },
    size: {
      control: { type: "select" },
      options: ["default", "sm", "lg", "icon"]
    }
  }
};

export const Default = {
  args: {
    children: "ボタン",
    variant: "default",
    size: "default"
  }
};

export const Secondary = {
  args: {
    children: "セカンダリボタン",
    variant: "secondary"
  }
};

export const WithIcon = {
  args: {
    children: (
      <>
        <IconPlus className="mr-2 h-4 w-4" />
        アイコン付きボタン
      </>
    )
  }
};
```

### インタラクションテスト

Storybook Playを使用して、コンポーネントのインタラクションテストを行っています：

```tsx
// src/components/repositories/repository-card.stories.tsx
export const Interactive = {
  args: {
    repository: {
      id: "repo-1",
      name: "ドキュメント",
      description: "製品ドキュメント、マニュアル、ガイドラインなどを管理するリポジトリです。",
      isPublic: true,
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-10T15:30:00Z"
    }
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    
    // カードをクリックしてリンクが機能することを確認
    await userEvent.click(canvas.getByText(args.repository.name));
    
    // アクションメニューをクリックして開く
    await userEvent.click(canvas.getByLabelText('アクション'));
    
    // 編集オプションが表示されることを確認
    const editOption = await canvas.findByText('編集');
    expect(editOption).toBeInTheDocument();
  }
};
```

## 🧪 テスト戦略

コンポーネントの品質を確保するために、以下のテスト戦略を実施しています：

### 1. ユニットテスト

コンポーネントの基本的な機能とレンダリングを検証するためのテスト：

```tsx
// src/components/ui/__tests__/button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';

describe('Button', () => {
  it('renders correctly with default props', () => {
    render(<Button>テストボタン</Button>);
    const button = screen.getByRole('button', { name: 'テストボタン' });
    expect(button).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', async () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>クリック</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'クリック' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies the correct class for variants', () => {
    const { rerender } = render(<Button variant="secondary">セカンダリ</Button>);
    let button = screen.getByRole('button', { name: 'セカンダリ' });
    expect(button).toHaveClass('bg-secondary');

    rerender(<Button variant="destructive">デストラクティブ</Button>);
    button = screen.getByRole('button', { name: 'デストラクティブ' });
    expect(button).toHaveClass('bg-destructive');
  });
});
```

### 2. インテグレーションテスト

複数のコンポーネントが連携して機能することを確認するテスト：

```tsx
// src/components/repositories/__tests__/repository-list.test.tsx
import { render, screen } from '@testing-library/react';
import { RepositoryList } from '../repository-list';
import { mockRepositories } from '@/mocks/repositories';

describe('RepositoryList', () => {
  it('renders repository cards for each repository', () => {
    render(<RepositoryList repositories={mockRepositories} />);
    
    // 各リポジトリ名が表示されていることを確認
    mockRepositories.forEach(repo => {
      expect(screen.getByText(repo.name)).toBeInTheDocument();
    });
  });

  it('shows empty state when no repositories are available', () => {
    render(<RepositoryList repositories={[]} />);
    expect(screen.getByText('リポジトリがありません')).toBeInTheDocument();
    expect(screen.getByText('新しいリポジトリを作成して始めましょう')).toBeInTheDocument();
  });
});
```

### 3. ビジュアルリグレッションテスト

Chromaticを使用して、コンポーネントの視覚的な変更を追跡しています：

```yaml
# package.json (一部)
{
  "scripts": {
    "chromatic": "chromatic --exit-zero-on-changes"
  }
}
```

## 📱 レスポンシブデザイン

CMSアプリケーションは、様々なデバイスサイズに対応するレスポンシブデザインを採用しています：

### ブレークポイント

Tailwind CSSのデフォルトブレークポイントを活用しています：

```
sm: 640px  // スマートフォン（横向き）
md: 768px  // タブレット
lg: 1024px // ノートPC
xl: 1280px // デスクトップ
2xl: 1536px // 大型ディスプレイ
```

### レスポンシブレイアウトの例

```tsx
// src/components/layout/main-layout.tsx
export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-col md:flex-row flex-1">
        <Sidebar className="w-full md:w-64 lg:w-72" />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
```

### モバイルファーストアプローチ

モバイル向けのデザインを基本として、より大きな画面サイズに対応するレイアウトを段階的に追加しています：

```tsx
// src/components/repositories/repository-list.tsx
export function RepositoryList({ repositories }: { repositories: Repository[] }) {
  return (
    <div className="space-y-4">
      {repositories.length === 0 ? (
        <EmptyState 
          title="リポジトリがありません"
          description="新しいリポジトリを作成して始めましょう"
          action={{
            label: "リポジトリを作成",
            href: "/repositories/new"
          }}
        />
      ) : (
        // モバイルでは縦並び、タブレット以上で2列、デスクトップで3列
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repositories.map((repo) => (
            <RepositoryCard key={repo.id} repository={repo} />
          ))}
        </div>
      )}
    </div>
  );
}
```

## ♿ アクセシビリティ

アクセシビリティを考慮したUI設計を行っています：

### セマンティックHTML

意味のあるHTMLタグとWAI-ARIA属性を適切に使用しています：

```tsx
// src/components/navigation/navbar.tsx
export function Navbar() {
  return (
    <nav aria-label="メインナビゲーション">
      <ul className="flex space-x-4">
        <li>
          <Link href="/dashboard" aria-current={isCurrentPage('/dashboard') ? 'page' : undefined}>
            ダッシュボード
          </Link>
        </li>
        <li>
          <Link href="/repositories" aria-current={isCurrentPage('/repositories') ? 'page' : undefined}>
            リポジトリ
          </Link>
        </li>
      </ul>
    </nav>
  );
}
```

### キーボードナビゲーション

すべてのインタラクティブ要素がキーボードでアクセス可能であることを確認しています：

```tsx
// src/components/ui/dropdown-menu.tsx
export function DropdownMenu({ trigger, items }: DropdownMenuProps) {
  return (
    <div onKeyDown={handleKeyDown}>
      <button 
        aria-haspopup="true" 
        aria-expanded={isOpen} 
        onClick={toggleMenu}
      >
        {trigger}
      </button>
      {isOpen && (
        <ul role="menu">
          {items.map((item, index) => (
            <li key={index} role="menuitem" tabIndex={0}>
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### コントラスト比

テキストとその背景の間に適切なコントラスト比を確保しています：

```tsx
// テキストカラーの設定
const textColors = {
  primary: "text-gray-900 dark:text-gray-50", // ハイコントラスト
  secondary: "text-gray-700 dark:text-gray-300", // ミディアムコントラスト
  muted: "text-gray-500 dark:text-gray-400" // 低コントラスト（非重要テキスト用）
};
```

## 🔄 状態管理

コンポーネント内での状態管理アプローチ：

### ローカル状態

シンプルな状態管理にはReactの`useState`と`useReducer`を使用：

```tsx
// src/components/content/content-editor.tsx
export function ContentEditor({ initialContent, onSave }: ContentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(content);
    } catch (error) {
      console.error('Failed to save content:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div>
      <textarea 
        value={content} 
        onChange={(e) => setContent(e.target.value)}
        className="w-full h-64 p-2 border rounded"
      />
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? '保存中...' : '保存'}
      </Button>
    </div>
  );
}
```

### 複雑な状態管理

複雑な状態遷移にはReducerパターンを適用：

```tsx
// src/components/repositories/repository-form.tsx
type State = {
  name: string;
  description: string;
  isPublic: boolean;
  isSubmitting: boolean;
  errors: Record<string, string>;
};

type Action =
  | { type: 'SET_FIELD', field: keyof Omit<State, 'isSubmitting' | 'errors'>, value: any }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS' }
  | { type: 'SUBMIT_ERROR', errors: Record<string, string> };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true, errors: {} };
    case 'SUBMIT_SUCCESS':
      return { ...state, isSubmitting: false };
    case 'SUBMIT_ERROR':
      return { ...state, isSubmitting: false, errors: action.errors };
    default:
      return state;
  }
};

export function RepositoryForm({ onSubmit }: RepositoryFormProps) {
  const [state, dispatch] = useReducer(reducer, {
    name: '',
    description: '',
    isPublic: true,
    isSubmitting: false,
    errors: {}
  });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'SUBMIT_START' });
    
    try {
      await onSubmit({
        name: state.name,
        description: state.description,
        isPublic: state.isPublic
      });
      dispatch({ type: 'SUBMIT_SUCCESS' });
    } catch (error) {
      dispatch({ 
        type: 'SUBMIT_ERROR', 
        errors: { form: 'フォームの送信に失敗しました' } 
      });
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* フォームフィールド */}
    </form>
  );
}
```

## 📝 ベストプラクティス

CMSアプリケーションの開発における推奨プラクティス：

### コンポーネント設計

1. **単一責任の原則**: 各コンポーネントは明確に定義された単一の責任を持つこと
2. **Props APIの明確化**: 必須/オプションのpropsを明示的に型定義
3. **デフォルト値の適切な設定**: オプションのpropsには妥当なデフォルト値を設定
4. **コンポーネントの分割**: 300行を超えるコンポーネントは分割を検討

### パフォーマンス最適化

1. **メモ化**: 不要な再レンダリングを防ぐために`React.memo`、`useMemo`、`useCallback`を適切に使用
2. **遅延ロード**: `next/dynamic`を使用した重いコンポーネントの遅延ロード
3. **仮想化**: 大量のリストアイテムには仮想化ライブラリ（`react-window`など）を検討

### コードスタイル

1. **命名規則**: コンポーネントはPascalCase、関数/変数はcamelCaseを使用
2. **コメント**: 複雑なロジックには説明的なコメントを追加
3. **一貫したインポート順**: 外部ライブラリ → 内部モジュール → 型定義 → スタイル

## 🔧 今後の改善計画

1. **テスト網羅率の向上**: 主要コンポーネントのカバレッジ95%以上を目指す
2. **アクセシビリティの強化**: WCAG 2.1 AAレベルの完全準拠
3. **パフォーマンス最適化**: Lighthouse スコア90以上を全ページで達成
4. **ドキュメントの充実**: 全コンポーネントのStorybook事例と使用方法の文書化
5. **インターナショナリゼーション**: 多言語対応フレームワークの導入 