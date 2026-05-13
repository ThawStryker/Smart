#!/bin/bash
# ============================================================
# Smart Domain Sync — long-running sync daemon
#
# Usage:  ./sync-domains.sh
# Daemon: nohup ./sync-domains.sh >> /tmp/sync-domains.log 2>&1 &
#
# Requires: edgespark CLI (authenticated), curl, jq
# ============================================================

INTERVAL="${INTERVAL:-10}"
API_BASE="${SMART_API_BASE:?Set SMART_API_BASE env var}"
API_KEY="${SMART_API_KEY:?Set SMART_API_KEY env var}"
PROJECT_DIR="${SMART_PROJECT_DIR:?Set SMART_PROJECT_DIR env var}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-5m}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

api_get() {
  curl -sS -H "Authorization: Bearer ${API_KEY}" "${API_BASE}${1}"
}

api_post() {
  curl -sS -X POST -H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" -d "${2}" "${API_BASE}${1}"
}

api_delete() {
  curl -sS -X DELETE -H "Authorization: Bearer ${API_KEY}" "${API_BASE}${1}"
}

cd "$PROJECT_DIR"
log "=== Daemon started (interval=${INTERVAL}s) ==="

while true; do
  resp=$(api_get "/api/public/smart/domains")
  if echo "$resp" | grep -q '"error"'; then
    log "ERROR fetching domains: $resp"
    sleep "$INTERVAL"
    continue
  fi

  echo "$resp" | jq -c '.domains[] | select(.status == "pending")' 2>/dev/null | while read -r d; do
    id=$(echo "$d" | jq -r '.id')
    domain=$(echo "$d" | jq -r '.domain')
    log "ADD: $domain"

    add_output=$(edgespark domain add "$domain" 2>&1) || true
    cname_value=$(echo "$add_output" | grep "CNAME" | sed 's/.*-> *//')
    txt_host=$(echo "$add_output" | grep "TXT" | sed 's/.*TXT *//' | sed 's/ *->.*//')
    txt_value=$(echo "$add_output" | grep "TXT" | sed 's/.*-> *//')

    if [ -z "$cname_value" ] || [ -z "$txt_host" ] || [ -z "$txt_value" ]; then
      log "  PARSE ERROR: $add_output"
      continue
    fi

    log "  CNAME=$cname_value TXT=$txt_value"
    dns_json=$(jq -n --arg cv "$cname_value" --arg th "$txt_host" --arg tv "$txt_value" \
      '{cnameValue: $cv, txtHost: $th, txtValue: $tv}')
    api_post "/api/public/smart/domains/${id}/dns-records" "$dns_json"
  done

  echo "$resp" | jq -c '.domains[] | select(.status == "dns_ready")' 2>/dev/null | while read -r d; do
    id=$(echo "$d" | jq -r '.id')
    domain=$(echo "$d" | jq -r '.domain')
    log "VERIFY: $domain"

    api_post "/api/public/smart/domains/${id}/start-verify" '{}'
    verify_output=$(edgespark domain verify "$domain" --timeout "$VERIFY_TIMEOUT" 2>&1) || true

    if echo "$verify_output" | grep -q "active"; then
      log "  ACTIVE"
      api_post "/api/public/smart/domains/${id}/verify-result" '{"success": true}'
    else
      log "  NOT ACTIVE"
    fi
  done

  echo "$resp" | jq -c '.domains[] | select(.status == "removing" or .status == "failed")' 2>/dev/null | while read -r d; do
    id=$(echo "$d" | jq -r '.id')
    domain=$(echo "$d" | jq -r '.domain')
    log "REMOVE: $domain"
    edgespark domain remove "$domain" 2>&1 || true
    api_delete "/api/public/smart/domains/${id}"
    log "  DELETED"
  done

  sleep "$INTERVAL"
done
