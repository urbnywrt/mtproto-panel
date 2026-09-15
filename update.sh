#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  MTProto Panel - Обновление            ${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Парсим аргументы. Исходный список сохраняем: его же получит контейнер-спутник.
ARGS=("$@")
FORCE_BRANCH=""
FORCE_BUILD=0
FORCE_PULL=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --b=*) FORCE_BRANCH="${1#--b=}"; shift ;;
        --b) FORCE_BRANCH="$2"; shift 2 ;;
        --build) FORCE_BUILD=1; shift ;;
        --pull) FORCE_PULL=1; shift ;;
        *) shift ;;
    esac
done

# Проверяем права root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Ошибка: запустите скрипт с правами root (sudo bash update.sh).${NC}"
    exit 1
fi

# Проверяем что мы в директории с docker-compose.yml
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Ошибка: docker-compose.yml не найден.${NC}"
    echo -e "Запустите скрипт из директории панели (/opt/mtproto-panel/panel)."
    exit 1
fi

# Проверяем что это git-репозиторий (или что родительская директория является им)
GIT_ROOT=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || git -C ".." rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -z "$GIT_ROOT" ]; then
    echo -e "${RED}Ошибка: не найден git-репозиторий.${NC}"
    echo -e "Панель должна быть установлена через git clone."
    exit 1
fi

# Проверяем наличие .env
if [ ! -f ".env" ]; then
    echo -e "${RED}Ошибка: файл .env не найден.${NC}"
    echo -e "Убедитесь что панель была установлена через install.sh."
    exit 1
fi

# Кнопка «Обновить» в настройках запускает скрипт внутри контейнера бэкенда. Там он
# убивал сам себя: `docker compose down` удаляет контейнер, в котором работает скрипт,
# и поднимать панель обратно было некому. Поэтому перезапускаемся в контейнере-спутнике —
# он не входит в compose-проект, и `down` его не трогает.
#
# Каталог проекта монтируется по тому же пути, что и на хосте: демон трактует
# относительные пути docker-compose.yml как хостовые, и из каталога, смонтированного
# куда-то ещё, `.:/app/project` указал бы в пустоту.
if [ -f /.dockerenv ] && [ "${MTPROTO_UPDATE_SIDECAR:-0}" != "1" ]; then
    SELF_NAME="mtproto-panel-backend"
    HOST_PROJECT=$(docker inspect "$SELF_NAME" --format '{{range .Mounts}}{{if eq .Destination "/app/project"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)
    SELF_IMAGE=$(docker inspect "$SELF_NAME" --format '{{.Config.Image}}' 2>/dev/null || true)

    if [ -z "$HOST_PROJECT" ] || [ -z "$SELF_IMAGE" ]; then
        echo -e "${RED}Не удалось определить каталог проекта на хосте.${NC}"
        echo -e "Обновление отменено, чтобы не оставить панель выключенной."
        exit 1
    fi

    docker rm -f mtproto-panel-updater >/dev/null 2>&1 || true
    docker run -d --name mtproto-panel-updater \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "${HOST_PROJECT}":"${HOST_PROJECT}" \
        -w "${HOST_PROJECT}" \
        -e MTPROTO_UPDATE_SIDECAR=1 \
        -e HOST_PROJECT="${HOST_PROJECT}" \
        "$SELF_IMAGE" \
        bash -c 'bash update.sh "$@" > "${HOST_PROJECT}/update.log" 2>&1' _ "${ARGS[@]}" >/dev/null

    echo -e "${GREEN}Обновление запущено в отдельном контейнере mtproto-panel-updater.${NC}"
    echo -e "Панель перезапустится сама; журнал — update.log"
    exit 0
fi

echo -e "${CYAN}[1/4] Получение обновлений из репозитория...${NC}"

cd "$GIT_ROOT"

# Сохраняем локальные изменения если есть (.env, data/)
git stash --include-untracked 2>/dev/null || true

# Определяем ветку (из аргумента или автоматически)
if [ -n "$FORCE_BRANCH" ]; then
    BRANCH="$FORCE_BRANCH"
else
    BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}')
    BRANCH=${BRANCH:-master}
fi
echo -e "  Ветка: ${YELLOW}${BRANCH}${NC}"

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git stash pop 2>/dev/null || true

echo -e "${GREEN}  Обновления получены.${NC}"

# Возвращаемся в директорию панели
cd "$(dirname "$0")"

# Фиксируем имя проекта, чтобы volume pgdata всегда именовался одинаково
# независимо от того, из какой директории запущен скрипт
export COMPOSE_PROJECT_NAME=mtproto-panel

echo -e "${CYAN}[2/4] Остановка панели...${NC}"
docker compose down
echo -e "${GREEN}  Панель остановлена.${NC}"

echo -e "${CYAN}[3/4] Загрузка обновлённых образов...${NC}"

# Каждая ветка публикуется в GHCR под своим тегом, а :latest двигают только master и dev.
# Тянуть :latest, обновляясь с другой ветки, значит запустить чужой код поверх её
# исходников — молча и без единой ошибки. Поэтому для ветки берём её собственный тег.
if [ "$FORCE_BUILD" -eq 0 ] && [ "$FORCE_PULL" -eq 0 ] && [ "$BRANCH" != "master" ] && [ "$BRANCH" != "dev" ]; then
    if [ -z "${IMAGE_TAG:-}" ] && ! grep -q '^IMAGE_TAG=' .env 2>/dev/null; then
        IMAGE_TAG=$(echo "$BRANCH" | tr '/' '-' | tr '[:upper:]' '[:lower:]')
        export IMAGE_TAG
        echo -e "  Тег образов для ветки: ${YELLOW}${IMAGE_TAG}${NC}"
    fi
fi

if [ "$FORCE_BUILD" -eq 1 ]; then
    BUILDX_NO_DEFAULT_ATTESTATIONS=1 DOCKER_BUILDKIT=1 docker compose build
elif docker compose pull 2>/dev/null; then
    echo -e "${GREEN}  Образы загружены из реестра.${NC}"
else
    echo -e "${YELLOW}  Готовых образов нет, собираем локально...${NC}"
    BUILDX_NO_DEFAULT_ATTESTATIONS=1 DOCKER_BUILDKIT=1 docker compose build
fi

echo -e "${CYAN}  Запуск панели...${NC}"
docker compose up -d
echo -e "  Ожидание запуска..."
sleep 5

echo -e "${CYAN}[4/4] Проверка статуса...${NC}"

if docker compose ps | grep -q "Up"; then
    echo -e "${GREEN}  Панель успешно запущена!${NC}"
else
    echo -e "${RED}Ошибка: один или несколько контейнеров не запустились.${NC}"
    echo -e "Проверьте логи: docker compose logs"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Обновление панели завершено!          ${NC}"
echo -e "${GREEN}========================================${NC}"
