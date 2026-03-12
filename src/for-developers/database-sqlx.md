# Database(SQLx)

sqlxコマンドは各crateのディレクトリで実行する。

## migration

## マイグレーションファイルの作成

`sqlx migrate add -r <name>`でマイグレーションファイルを作成できる。

## マイグレーションファイルの実行

`sqlx migrate run`でマイグレーションファイルを実行できる。

接続先は各ディレクトリに `.env` ファイルを作成し、`DATABASE_URL` を設定してある。ない場合は作成する。


## databaseのリセット

`sqlx migrate reset -y`でdatabaseをリセットできる。
