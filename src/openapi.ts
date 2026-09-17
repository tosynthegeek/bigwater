/**
 * Static OpenAPI 3.1 document for Swagger UI.
 *
 * API documentation is intentionally served only outside production.
 *
 * Keep request/response schemas here reasonably close to the actual API
 * contract. Longer-term, these should be derived from the same Zod schemas
 * used for runtime validation so that the OpenAPI document cannot drift.
 */

export const openApiDocument = {
  openapi: "3.1.0",

  info: {
    title: "BigWater Rail 2 API",
    version: "1.0.0",
    description:
      "Sustainability actions, proof submissions, participant scoring, leaderboard and admin back-office for BigWater Rail 2.",
  },

  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development",
    },
    {
      url: "https://bigwater-rail2-api-staging.up.railway.app",
      description: "Staging",
    },
  ],

  tags: [
    {
      name: "System",
      description: "Health and system endpoints.",
    },
    {
      name: "Tasks",
      description: "Participant-facing sustainability tasks.",
    },
    {
      name: "Submissions",
      description: "Participant proof submissions.",
    },
    {
      name: "Participants",
      description: "Current participant profile and submission history.",
    },
    {
      name: "Leaderboard",
      description: "Participant leaderboard and ranking information.",
    },
    {
      name: "Telegram",
      description: "Telegram account linking and participant integration.",
    },
    {
      name: "Admin",
      description: "Administrative operations. Requires admin access.",
    },
    {
      name: "Internal",
      description:
        "Service-to-service endpoints. These endpoints are not intended for browser/client use.",
    },
  ],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Privy access token supplied as Authorization: Bearer <token>.",
      },

      serviceKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Internal service authentication key. Used only for service-to-service callbacks.",
      },
    },

    parameters: {
      SubmissionId: {
        name: "id",
        in: "path",
        required: true,
        description: "Submission identifier.",
        schema: {
          type: "string",
        },
      },
    },

    responses: {
      Unauthorized: {
        description:
          "Authentication is required or the supplied credentials are invalid.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },

      Forbidden: {
        description:
          "The authenticated account does not have permission to perform this operation.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },

      NotFound: {
        description: "The requested resource does not exist.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },

      ValidationError: {
        description: "The request failed validation.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },

      InternalError: {
        description: "An unexpected server error occurred.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
    },

    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "requestId"],
            properties: {
              code: {
                type: "string",
                example: "VALIDATION_ERROR",
              },
              message: {
                type: "string",
                example: "Request validation failed",
              },
              requestId: {
                type: "string",
                example: "req_01JEXAMPLE123",
                description:
                  "Unique identifier used to trace the request through application logs.",
              },
              details: {
                type: "object",
                additionalProperties: true,
                description: "Optional structured information about the error.",
              },
            },
          },
        },
      },

      Task: {
        type: "object",
        description: "A sustainability action available to participants.",
        properties: {
          id: {
            type: "string",
            example: "task_123",
          },
          title: {
            type: "string",
            example: "Use public transport",
          },
          description: {
            type: "string",
            example: "Take public transport instead of a private vehicle.",
          },
          points: {
            type: "number",
            example: 10,
          },
          enabled: {
            type: "boolean",
            example: true,
          },
        },
        additionalProperties: true,
      },

      Submission: {
        type: "object",
        description: "A participant proof submission.",
        properties: {
          id: {
            type: "string",
            example: "submission_123",
          },
          taskId: {
            type: "string",
            example: "task_123",
          },
          status: {
            type: "string",
            example: "under_review",
          },
          confidence: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 1,
            example: 0.94,
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
        additionalProperties: true,
      },

      ParticipantProfile: {
        type: "object",
        description: "The authenticated participant's Rail 2 profile.",
        properties: {
          userId: {
            type: "string",
          },
          rail1UserId: {
            type: ["string", "null"],
            description:
              "Identifier of the corresponding Rail 1 user, when available.",
          },
          telegramId: {
            type: ["string", "null"],
          },
        },
        additionalProperties: true,
      },

      SubmissionLimits: {
        type: "object",
        description: "Current participant submission limits.",
        properties: {
          remaining: {
            type: "integer",
            example: 3,
          },
          limit: {
            type: "integer",
            example: 5,
          },
        },
        additionalProperties: true,
      },

      LeaderboardEntry: {
        type: "object",
        properties: {
          rank: {
            type: "integer",
            example: 1,
          },
          userId: {
            type: "string",
            example: "user_123",
          },
          username: {
            type: ["string", "null"],
            example: "tosin",
          },
          score: {
            type: "number",
            example: 820,
          },
        },
        additionalProperties: true,
      },

      AdminLoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "admin@example.com",
          },
          password: {
            type: "string",
            format: "password",
            example: "********",
          },
        },
      },

      AdminLoginResponse: {
        type: "object",
        additionalProperties: true,
        description:
          "Successful admin authentication response. The exact session representation depends on the configured authentication flow.",
      },

      InternalSubmissionReviewRequest: {
        type: "object",
        properties: {
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            example: 0.94,
          },
        },
        required: ["confidence"],
        additionalProperties: true,
      },
    },
  },

  paths: {
    // -----------------------------------------------------------------------
    // System
    // -----------------------------------------------------------------------

    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        description:
          "Checks whether the API process is running and the PostgreSQL database is reachable. Used by Railway and uptime probes. No authentication required.",
        responses: {
          "200": {
            description: "API and database are healthy.",
            content: {
              "text/plain": {
                schema: {
                  type: "string",
                  example: "OK",
                },
              },
            },
          },

          "500": {
            description: "Database is unavailable.",
            content: {
              "text/plain": {
                schema: {
                  type: "string",
                  example: "Database unavailable",
                },
              },
            },
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Tasks
    // -----------------------------------------------------------------------

    "/api/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List active tasks",
        description:
          "Returns the active sustainability tasks available to the authenticated participant. On initial participant contact, the application may also require the Rail 1 bootstrap token in addition to the normal Privy authentication flow.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "List of active tasks.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Task",
                  },
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Submissions
    // -----------------------------------------------------------------------

    "/api/submissions/send": {
      post: {
        tags: ["Submissions"],
        summary: "Submit proof",
        description:
          "Creates a proof submission for a sustainability task. The proof is uploaded and the submission enters the Rail 2 verification workflow.",

        security: [{ bearerAuth: [] }],

        requestBody: {
          required: true,

          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["taskId", "file"],
                properties: {
                  taskId: {
                    type: "string",
                    description: "Task being completed.",
                    example: "task_123",
                  },

                  file: {
                    type: "string",
                    format: "binary",
                    description: "Proof image.",
                  },
                },
              },
            },
          },
        },

        responses: {
          "201": {
            description: "Submission created.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Submission",
                },
              },
            },
          },

          "400": {
            $ref: "#/components/responses/ValidationError",
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "403": {
            $ref: "#/components/responses/Forbidden",
          },

          "413": {
            description: "Uploaded payload is too large.",
            content: {
              "text/plain": {
                schema: {
                  type: "string",
                  example: "Payload too large",
                },
              },
            },
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/submissions/limits": {
      get: {
        tags: ["Submissions"],
        summary: "Get submission limits",
        description:
          "Returns the authenticated participant's current submission limits.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "Current submission limits.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SubmissionLimits",
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/submissions/{id}": {
      get: {
        tags: ["Submissions"],
        summary: "Get a submission",
        description:
          "Returns a single submission belonging to the authenticated participant.",

        security: [{ bearerAuth: [] }],

        parameters: [
          {
            $ref: "#/components/parameters/SubmissionId",
          },
        ],

        responses: {
          "200": {
            description: "Submission details.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Submission",
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "404": {
            $ref: "#/components/responses/NotFound",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Participants
    // -----------------------------------------------------------------------

    "/api/participants/profile": {
      get: {
        tags: ["Participants"],
        summary: "Get current participant profile",
        description:
          "Returns the profile associated with the currently authenticated participant.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "Participant profile.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ParticipantProfile",
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "404": {
            $ref: "#/components/responses/NotFound",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/participants/submissions": {
      get: {
        tags: ["Participants"],
        summary: "List my submissions",
        description:
          "Returns the submissions belonging to the authenticated participant.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "Participant submissions.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Submission",
                  },
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Leaderboard
    // -----------------------------------------------------------------------

    "/api/leaderboard": {
      get: {
        tags: ["Leaderboard"],
        summary: "Get leaderboard",
        description: "Returns leaderboard information for Rail 2 participants.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "Leaderboard data.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/LeaderboardEntry",
                  },
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Telegram
    // -----------------------------------------------------------------------

    "/api/telegram/link-code": {
      post: {
        tags: ["Telegram"],
        summary: "Generate Telegram link code",
        description:
          "Creates a temporary code that allows the authenticated participant to link their Telegram account.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "Telegram link code created.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    code: {
                      type: "string",
                      example: "ABCD1234",
                    },
                  },
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    "/api/admin/login": {
      post: {
        tags: ["Admin"],
        summary: "Admin login",
        description:
          "Authenticates an administrator. Depending on the configured authentication flow, the resulting session may be represented by a bearer token or an admin session cookie.",

        responses: {
          "200": {
            description: "Admin successfully authenticated.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminLoginResponse",
                },
              },
            },
          },

          "400": {
            $ref: "#/components/responses/ValidationError",
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },

    "/api/admin/tasks": {
      get: {
        tags: ["Admin"],
        summary: "List all tasks",
        description: "Returns the task catalogue for administrators.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "All tasks.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Task",
                  },
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "403": {
            $ref: "#/components/responses/Forbidden",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },

      post: {
        tags: ["Admin"],
        summary: "Create task",
        description: "Creates a new sustainability task.",

        security: [{ bearerAuth: [] }],

        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Task",
              },
            },
          },
        },

        responses: {
          "201": {
            description: "Task created.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Task",
                },
              },
            },
          },

          "400": {
            $ref: "#/components/responses/ValidationError",
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "403": {
            $ref: "#/components/responses/Forbidden",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/admin/submissions/review": {
      get: {
        tags: ["Admin"],
        summary: "Get submissions ready for review",
        description:
          "Returns submissions currently available to administrators for review.",

        security: [{ bearerAuth: [] }],

        responses: {
          "200": {
            description: "Submission review queue.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Submission",
                  },
                },
              },
            },
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "403": {
            $ref: "#/components/responses/Forbidden",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    "/internal/submissions/{id}/review": {
      patch: {
        tags: ["Internal"],
        summary: "AI verification callback",
        description:
          "Internal service-to-service callback used by the AI verification pipeline to attach a confidence score and move a submission into the appropriate review state. This endpoint is not intended for browser or participant use.",

        security: [{ serviceKey: [] }],

        parameters: [
          {
            $ref: "#/components/parameters/SubmissionId",
          },
        ],

        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/InternalSubmissionReviewRequest",
              },
            },
          },
        },

        responses: {
          "200": {
            description: "Submission updated.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Submission",
                },
              },
            },
          },

          "400": {
            $ref: "#/components/responses/ValidationError",
          },

          "401": {
            $ref: "#/components/responses/Unauthorized",
          },

          "404": {
            $ref: "#/components/responses/NotFound",
          },

          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },
  },
} as const;
