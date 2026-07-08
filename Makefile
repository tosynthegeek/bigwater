.PHONY: docker-up docker-down docker-logs dev api bot stop status logs logs-api logs-bot clean

LOG_DIR := logs
RUN_DIR := .run

docker-up:
	docker compose up -d postgres redis

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f postgres redis


$(LOG_DIR):
	mkdir -p $(LOG_DIR)

$(RUN_DIR):
	mkdir -p $(RUN_DIR)

api:
	bun --watch run index.ts

bot:
	bun --watch run src/telegram/index.ts

dev: docker-up | $(LOG_DIR) $(RUN_DIR)
	@if [ -f $(RUN_DIR)/api.pid ] && kill -0 $$(cat $(RUN_DIR)/api.pid) 2>/dev/null; then \
		echo "api already running (PID $$(cat $(RUN_DIR)/api.pid))"; \
	else \
		nohup bun --watch run index.ts > $(LOG_DIR)/api.log 2>&1 & echo $$! > $(RUN_DIR)/api.pid; \
		echo "api started (PID $$(cat $(RUN_DIR)/api.pid))"; \
	fi
	@if [ -f $(RUN_DIR)/bot.pid ] && kill -0 $$(cat $(RUN_DIR)/bot.pid) 2>/dev/null; then \
		echo "bot already running (PID $$(cat $(RUN_DIR)/bot.pid))"; \
	else \
		nohup bun --watch run src/telegram/index.ts > $(LOG_DIR)/bot.log 2>&1 & echo $$! > $(RUN_DIR)/bot.pid; \
		echo "bot started (PID $$(cat $(RUN_DIR)/bot.pid))"; \
	fi
	@echo "Both up. Tail logs with: make logs"

stop:
	@if [ -f $(RUN_DIR)/api.pid ]; then kill $$(cat $(RUN_DIR)/api.pid) 2>/dev/null; rm -f $(RUN_DIR)/api.pid; echo "api stopped"; fi
	@if [ -f $(RUN_DIR)/bot.pid ]; then kill $$(cat $(RUN_DIR)/bot.pid) 2>/dev/null; rm -f $(RUN_DIR)/bot.pid; echo "bot stopped"; fi

status:
	@for svc in api bot; do \
		if [ -f $(RUN_DIR)/$$svc.pid ] && kill -0 $$(cat $(RUN_DIR)/$$svc.pid) 2>/dev/null; then \
			echo "$$svc: running (PID $$(cat $(RUN_DIR)/$$svc.pid))"; \
		else \
			echo "$$svc: not running"; \
		fi; \
	done

logs:
	tail -f $(LOG_DIR)/api.log $(LOG_DIR)/bot.log

logs-api:
	tail -f $(LOG_DIR)/api.log

logs-bot:
	tail -f $(LOG_DIR)/bot.log

clean: stop
	rm -rf $(LOG_DIR) $(RUN_DIR)