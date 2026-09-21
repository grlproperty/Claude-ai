-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('CEO', 'SALES_AGENT', 'RENTALS', 'ACCOUNTS', 'MARKETING_ADMIN', 'OPERATIONS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."Department" AS ENUM ('EXECUTIVE', 'SALES', 'RENTALS', 'ACCOUNTS', 'MARKETING', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "public"."ContactKind" AS ENUM ('LEAD', 'BUYER', 'SELLER', 'LANDLORD', 'TENANT', 'SUPPLIER', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."PropertyStatus" AS ENUM ('PROSPECT', 'APPRAISAL', 'MANDATE_PENDING', 'LISTED', 'UNDER_OFFER', 'SOLD', 'WITHDRAWN', 'RENTAL_ACTIVE');

-- CreateEnum
CREATE TYPE "public"."LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'OFFER', 'CONVERTED', 'LOST', 'STALLED');

-- CreateEnum
CREATE TYPE "public"."MandateType" AS ENUM ('SOLE', 'OPEN', 'JOINT');

-- CreateEnum
CREATE TYPE "public"."MandateStatus" AS ENUM ('REQUESTED', 'GATHERING', 'PREPARED', 'IN_REVIEW', 'APPROVED', 'SIGNED', 'ACTIVE', 'EXPIRED', 'DECLINED');

-- CreateEnum
CREATE TYPE "public"."OfferStatus" AS ENUM ('RECEIVED', 'PREPARED', 'IN_REVIEW', 'PRESENTED', 'ACCEPTED', 'COUNTERED', 'DECLINED', 'LAPSED');

-- CreateEnum
CREATE TYPE "public"."TransactionStage" AS ENUM ('OFFER_ACCEPTED', 'BOND_APPLICATION', 'BOND_GRANTED', 'CONVEYANCING', 'TRANSFER_LODGED', 'REGISTERED', 'COMMISSION_PAID', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."AssessmentStatus" AS ENUM ('DRAFT', 'PREPARED', 'NEEDS_INPUT', 'IN_REVIEW', 'APPROVED', 'ISSUED');

-- CreateEnum
CREATE TYPE "public"."DocumentKind" AS ENUM ('MANDATE', 'OTP', 'MARKET_ASSESSMENT', 'FICA', 'TITLE_DEED', 'RATES_CLEARANCE', 'COMPLIANCE_CERTIFICATE', 'ID_DOCUMENT', 'LEASE', 'INSPECTION', 'COMMISSION', 'CORRESPONDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('UPLOADED', 'CLASSIFIED', 'EXTRACTED', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'AWAITING_SIGNATURE', 'SIGNED', 'FILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."OwnerType" AS ENUM ('AI', 'AUTOMATION', 'USER', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_APPROVAL', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "public"."EscalationLevel" AS ENUM ('L1_STAFF', 'L2_MANAGEMENT', 'L3_CEO');

-- CreateEnum
CREATE TYPE "public"."DataDomain" AS ENUM ('BUSINESS', 'PERSONAL');

-- CreateEnum
CREATE TYPE "public"."ApprovalLevel" AS ENUM ('AUTO', 'AUTO_WITH_RULES', 'REVIEW', 'APPROVAL', 'SIGNATURE', 'MANDY_ONLY');

-- CreateEnum
CREATE TYPE "public"."ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'DELEGATED', 'DEFERRED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."SignatureStatus" AS ENUM ('REQUESTED', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."WorkflowRunStatus" AS ENUM ('RUNNING', 'WAITING_APPROVAL', 'WAITING_INPUT', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS', 'PHONE', 'PORTAL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "public"."CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "public"."TriageDecision" AS ENUM ('AI_HANDLE', 'AUTO_REPLY', 'DRAFT_FOR_REVIEW', 'DELEGATE', 'ESCALATE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."CommunicationCategory" AS ENUM ('URGENT', 'CLIENT', 'SALES', 'RENTAL', 'STAFF', 'FINANCE', 'MARKETING', 'PERSONAL', 'INFORMATIONAL', 'LOW_PRIORITY');

-- CreateEnum
CREATE TYPE "public"."NotificationTier" AS ENUM ('INFORMATION', 'ATTENTION', 'DECISION', 'URGENT');

-- CreateEnum
CREATE TYPE "public"."RiskKind" AS ENUM ('FORGOTTEN_LEAD', 'OVERDUE_FOLLOW_UP', 'UNSIGNED_DOCUMENT', 'INCOMPLETE_FILE', 'MISSED_DEADLINE', 'STALLED_TRANSACTION', 'UNANSWERED_CLIENT', 'OVERDUE_STAFF_TASK', 'NEGLECTED_RENEWAL', 'MANDATE_EXPIRING', 'UNRESOLVED_ESCALATION');

-- CreateEnum
CREATE TYPE "public"."ProvenanceKind" AS ENUM ('FACT', 'INFERENCE', 'RECOMMENDATION', 'DECISION');

-- CreateEnum
CREATE TYPE "public"."AiActionStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'BLOCKED_BY_APPROVAL', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CREDENTIALS_MISSING', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "public"."Role" NOT NULL,
    "department" "public"."Department" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isCeo" BOOLEAN NOT NULL DEFAULT false,
    "weeklyCapacityHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "acceptsDelegation" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" "public"."ProvenanceKind" NOT NULL DEFAULT 'INFERENCE',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contact" (
    "id" TEXT NOT NULL,
    "kind" "public"."ContactKind" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "idNumber" TEXT,
    "notes" TEXT,
    "domain" "public"."DataDomain" NOT NULL DEFAULT 'BUSINESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Property" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "public"."PropertyStatus" NOT NULL DEFAULT 'PROSPECT',
    "addressLine" TEXT NOT NULL,
    "suburb" TEXT,
    "town" TEXT,
    "province" TEXT NOT NULL DEFAULT 'Western Cape',
    "propertyType" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "garages" INTEGER,
    "floorSizeSqm" DOUBLE PRECISION,
    "landSizeSqm" DOUBLE PRECISION,
    "condition" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "askingPrice" DECIMAL(14,2),
    "soldPrice" DECIMAL(14,2),
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "id" TEXT NOT NULL,
    "stage" "public"."LeadStage" NOT NULL DEFAULT 'NEW',
    "source" TEXT,
    "contactId" TEXT NOT NULL,
    "propertyId" TEXT,
    "ownerId" TEXT,
    "requirements" TEXT,
    "budgetMin" DECIMAL(14,2),
    "budgetMax" DECIMAL(14,2),
    "lastContactAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Viewing" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "leadId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "feedback" TEXT,
    "feedbackRequestedAt" TIMESTAMP(3),
    "sellerUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Mandate" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "public"."MandateType" NOT NULL DEFAULT 'SOLE',
    "status" "public"."MandateStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "commissionPct" DECIMAL(5,2),
    "listPrice" DECIMAL(14,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Offer" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT,
    "status" "public"."OfferStatus" NOT NULL DEFAULT 'RECEIVED',
    "amount" DECIMAL(14,2),
    "depositAmount" DECIMAL(14,2),
    "bondAmount" DECIMAL(14,2),
    "bondApprovalDays" INTEGER,
    "occupationDate" TIMESTAMP(3),
    "suspensiveConditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "offerId" TEXT,
    "stage" "public"."TransactionStage" NOT NULL DEFAULT 'OFFER_ACCEPTED',
    "attorneyName" TEXT,
    "attorneyEmail" TEXT,
    "bondOriginator" TEXT,
    "expectedRegistrationDate" TIMESTAMP(3),
    "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransactionChecklistItem" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "stage" "public"."TransactionStage" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "documentId" TEXT,

    CONSTRAINT "TransactionChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketAssessment" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "status" "public"."AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "recommendedLow" DECIMAL(14,2),
    "recommendedHigh" DECIMAL(14,2),
    "pricePerSqm" DECIMAL(14,2),
    "workings" JSONB,
    "executiveSummary" TEXT,
    "missingInputs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preparedByAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Comparable" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "addressLine" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "isSoldPrice" BOOLEAN NOT NULL DEFAULT false,
    "floorSizeSqm" DOUBLE PRECISION,
    "landSizeSqm" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "saleDate" TIMESTAMP(3),
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "adjustments" JSONB,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusionReason" TEXT,

    CONSTRAINT "Comparable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "kind" "public"."DocumentKind" NOT NULL,
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "title" TEXT NOT NULL,
    "domain" "public"."DataDomain" NOT NULL DEFAULT 'BUSINESS',
    "storageProvider" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "uploadedById" TEXT,
    "propertyId" TEXT,
    "contactId" TEXT,
    "mandateId" TEXT,
    "offerId" TEXT,
    "transactionId" TEXT,
    "assessmentId" TEXT,
    "templateVersionId" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT,
    "createdById" TEXT,
    "createdByAi" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExtractedField" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "provenance" "public"."ProvenanceKind" NOT NULL DEFAULT 'INFERENCE',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "sourceExcerpt" TEXT,

    CONSTRAINT "ExtractedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "public"."DocumentKind" NOT NULL,
    "ownerRole" "public"."Role" NOT NULL DEFAULT 'CEO',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "requiredApproval" "public"."ApprovalLevel" NOT NULL DEFAULT 'APPROVAL',
    "signatoryRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TemplateField" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" TEXT NOT NULL DEFAULT 'string',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "conditionalOn" JSONB,
    "validators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcePath" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "public"."Priority" NOT NULL DEFAULT 'NORMAL',
    "domain" "public"."DataDomain" NOT NULL DEFAULT 'BUSINESS',
    "ownerType" "public"."OwnerType" NOT NULL DEFAULT 'USER',
    "ownerId" TEXT,
    "department" "public"."Department",
    "createdById" TEXT,
    "createdByAi" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "nextAction" TEXT,
    "dueAt" TIMESTAMP(3),
    "escalationLevel" "public"."EscalationLevel" NOT NULL DEFAULT 'L1_STAFF',
    "requiredApproval" "public"."ApprovalLevel" NOT NULL DEFAULT 'AUTO',
    "estimatedMinutes" INTEGER,
    "routingRationale" TEXT,
    "blockedByTaskId" TEXT,
    "propertyId" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "mandateId" TEXT,
    "offerId" TEXT,
    "transactionId" TEXT,
    "documentId" TEXT,
    "workflowRunId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Escalation" (
    "id" TEXT NOT NULL,
    "level" "public"."EscalationLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "actionsTaken" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "options" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT NOT NULL,
    "recommendationReason" TEXT NOT NULL,
    "decisionRequired" TEXT NOT NULL,
    "financialImpact" DECIMAL(14,2),
    "clientImpact" TEXT,
    "riskNote" TEXT,
    "dueAt" TIMESTAMP(3),
    "assigneeId" TEXT,
    "taskId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Approval" (
    "id" TEXT NOT NULL,
    "level" "public"."ApprovalLevel" NOT NULL,
    "status" "public"."ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "approverId" TEXT,
    "approverRole" "public"."Role",
    "taskId" TEXT,
    "documentId" TEXT,
    "mandateId" TEXT,
    "offerId" TEXT,
    "assessmentId" TEXT,
    "workflowRunId" TEXT,
    "proposedAction" JSONB,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Signature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "public"."SignatureStatus" NOT NULL DEFAULT 'REQUESTED',
    "signerUserId" TEXT,
    "signerContactId" TEXT,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerRole" TEXT NOT NULL,
    "provider" TEXT,
    "providerEnvelopeId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "declinedReason" TEXT,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowRun" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "status" "public"."WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Communication" (
    "id" TEXT NOT NULL,
    "channel" "public"."CommunicationChannel" NOT NULL,
    "direction" "public"."CommunicationDirection" NOT NULL,
    "domain" "public"."DataDomain" NOT NULL DEFAULT 'BUSINESS',
    "externalId" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "fromName" TEXT,
    "fromAddress" TEXT,
    "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "category" "public"."CommunicationCategory",
    "triage" "public"."TriageDecision",
    "triageReason" TEXT,
    "urgencyScore" DOUBLE PRECISION,
    "ownerId" TEXT,
    "contactId" TEXT,
    "draftReply" TEXT,
    "draftApproved" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "domain" "public"."DataDomain" NOT NULL DEFAULT 'BUSINESS',
    "externalId" TEXT,
    "agenda" TEXT,
    "briefing" TEXT,
    "talkingPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "decisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preparedByAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MeetingAttendee" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "external" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "public"."NotificationTier" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "batchKey" TEXT,
    "batchedUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RiskFinding" (
    "id" TEXT NOT NULL,
    "kind" "public"."RiskKind" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "severity" "public"."Priority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "ownerId" TEXT,
    "suggestedAction" TEXT,
    "autoResolvable" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),

    CONSTRAINT "RiskFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiAction" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "public"."AiActionStatus" NOT NULL DEFAULT 'PLANNED',
    "summary" TEXT NOT NULL,
    "initiatedById" TEXT,
    "initiatedBy" TEXT NOT NULL DEFAULT 'system',
    "inputRefs" JSONB NOT NULL DEFAULT '{}',
    "outputRefs" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "minutesSaved" INTEGER NOT NULL DEFAULT 0,
    "savedFor" TEXT,
    "requiredApproval" "public"."ApprovalLevel" NOT NULL DEFAULT 'AUTO',
    "blockedReason" TEXT,
    "workflowRunId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "AiAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemoryEntry" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "provenance" "public"."ProvenanceKind" NOT NULL,
    "domain" "public"."DataDomain" NOT NULL DEFAULT 'BUSINESS',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "supersededById" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "public"."OwnerType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "rationale" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CapacitySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meetingMinutes" INTEGER NOT NULL DEFAULT 0,
    "openDecisions" INTEGER NOT NULL DEFAULT 0,
    "openTasks" INTEGER NOT NULL DEFAULT 0,
    "overdueTasks" INTEGER NOT NULL DEFAULT 0,
    "interruptionCount" INTEGER NOT NULL DEFAULT 0,
    "aiCompletedMinutes" INTEGER NOT NULL DEFAULT 0,
    "automatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "delegatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "humanRequiredMinutes" INTEGER NOT NULL DEFAULT 0,
    "loadScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapacitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AbsencePeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "interruptThreshold" "public"."NotificationTier" NOT NULL DEFAULT 'URGENT',
    "delegateId" TEXT,
    "returnBriefing" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsencePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Integration" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "public"."IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "requiredEnv" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");

-- CreateIndex
CREATE INDEX "User_department_idx" ON "public"."User"("department");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Preference_userId_key_key" ON "public"."Preference"("userId", "key");

-- CreateIndex
CREATE INDEX "Contact_kind_idx" ON "public"."Contact"("kind");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "public"."Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Property_reference_key" ON "public"."Property"("reference");

-- CreateIndex
CREATE INDEX "Property_status_idx" ON "public"."Property"("status");

-- CreateIndex
CREATE INDEX "Property_agentId_idx" ON "public"."Property"("agentId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "public"."Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "public"."Lead"("ownerId");

-- CreateIndex
CREATE INDEX "Lead_lastContactAt_idx" ON "public"."Lead"("lastContactAt");

-- CreateIndex
CREATE INDEX "Viewing_scheduledAt_idx" ON "public"."Viewing"("scheduledAt");

-- CreateIndex
CREATE INDEX "Viewing_completedAt_idx" ON "public"."Viewing"("completedAt");

-- CreateIndex
CREATE INDEX "Mandate_status_idx" ON "public"."Mandate"("status");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "public"."Offer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_offerId_key" ON "public"."Transaction"("offerId");

-- CreateIndex
CREATE INDEX "Transaction_stage_idx" ON "public"."Transaction"("stage");

-- CreateIndex
CREATE INDEX "Transaction_lastMovementAt_idx" ON "public"."Transaction"("lastMovementAt");

-- CreateIndex
CREATE INDEX "TransactionChecklistItem_transactionId_idx" ON "public"."TransactionChecklistItem"("transactionId");

-- CreateIndex
CREATE INDEX "Comparable_assessmentId_idx" ON "public"."Comparable"("assessmentId");

-- CreateIndex
CREATE INDEX "Document_kind_idx" ON "public"."Document"("kind");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "public"."Document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "public"."DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "ExtractedField_documentId_idx" ON "public"."ExtractedField"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_key_key" ON "public"."Template"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "public"."TemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateField_versionId_key_key" ON "public"."TemplateField"("versionId", "key");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "public"."Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_ownerId_status_idx" ON "public"."Task"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Task_ownerType_idx" ON "public"."Task"("ownerType");

-- CreateIndex
CREATE INDEX "Escalation_level_resolvedAt_idx" ON "public"."Escalation"("level", "resolvedAt");

-- CreateIndex
CREATE INDEX "Approval_status_level_idx" ON "public"."Approval"("status", "level");

-- CreateIndex
CREATE INDEX "Signature_documentId_idx" ON "public"."Signature"("documentId");

-- CreateIndex
CREATE INDEX "Signature_status_idx" ON "public"."Signature"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_key_key" ON "public"."WorkflowDefinition"("key");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_idx" ON "public"."WorkflowRun"("status");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_runId_idx" ON "public"."WorkflowStepRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Communication_externalId_key" ON "public"."Communication"("externalId");

-- CreateIndex
CREATE INDEX "Communication_receivedAt_idx" ON "public"."Communication"("receivedAt");

-- CreateIndex
CREATE INDEX "Communication_triage_idx" ON "public"."Communication"("triage");

-- CreateIndex
CREATE INDEX "Communication_ownerId_answeredAt_idx" ON "public"."Communication"("ownerId", "answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_externalId_key" ON "public"."Meeting"("externalId");

-- CreateIndex
CREATE INDEX "Meeting_startsAt_idx" ON "public"."Meeting"("startsAt");

-- CreateIndex
CREATE INDEX "MeetingAttendee_meetingId_idx" ON "public"."MeetingAttendee"("meetingId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_batchKey_idx" ON "public"."Notification"("batchKey");

-- CreateIndex
CREATE UNIQUE INDEX "RiskFinding_fingerprint_key" ON "public"."RiskFinding"("fingerprint");

-- CreateIndex
CREATE INDEX "RiskFinding_kind_resolvedAt_idx" ON "public"."RiskFinding"("kind", "resolvedAt");

-- CreateIndex
CREATE INDEX "AiAction_agent_status_idx" ON "public"."AiAction"("agent", "status");

-- CreateIndex
CREATE INDEX "AiAction_startedAt_idx" ON "public"."AiAction"("startedAt");

-- CreateIndex
CREATE INDEX "MemoryEntry_scope_idx" ON "public"."MemoryEntry"("scope");

-- CreateIndex
CREATE INDEX "MemoryEntry_provenance_idx" ON "public"."MemoryEntry"("provenance");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryEntry_scope_key_key" ON "public"."MemoryEntry"("scope", "key");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "public"."AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CapacitySnapshot_userId_date_key" ON "public"."CapacitySnapshot"("userId", "date");

-- CreateIndex
CREATE INDEX "AbsencePeriod_userId_active_idx" ON "public"."AbsencePeriod"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_key_key" ON "public"."Integration"("key");

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Preference" ADD CONSTRAINT "Preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Property" ADD CONSTRAINT "Property_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Viewing" ADD CONSTRAINT "Viewing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Viewing" ADD CONSTRAINT "Viewing_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Viewing" ADD CONSTRAINT "Viewing_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Mandate" ADD CONSTRAINT "Mandate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Mandate" ADD CONSTRAINT "Mandate_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Offer" ADD CONSTRAINT "Offer_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Offer" ADD CONSTRAINT "Offer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionChecklistItem" ADD CONSTRAINT "TransactionChecklistItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketAssessment" ADD CONSTRAINT "MarketAssessment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comparable" ADD CONSTRAINT "Comparable_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."MarketAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comparable" ADD CONSTRAINT "Comparable_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "public"."Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."MarketAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "public"."TemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExtractedField" ADD CONSTRAINT "ExtractedField_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TemplateField" ADD CONSTRAINT "TemplateField_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."TemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_blockedByTaskId_fkey" FOREIGN KEY ("blockedByTaskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "public"."Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "public"."WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Escalation" ADD CONSTRAINT "Escalation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Escalation" ADD CONSTRAINT "Escalation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Approval" ADD CONSTRAINT "Approval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Approval" ADD CONSTRAINT "Approval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Approval" ADD CONSTRAINT "Approval_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "public"."Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Approval" ADD CONSTRAINT "Approval_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Approval" ADD CONSTRAINT "Approval_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."MarketAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Approval" ADD CONSTRAINT "Approval_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "public"."WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Signature" ADD CONSTRAINT "Signature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Signature" ADD CONSTRAINT "Signature_signerUserId_fkey" FOREIGN KEY ("signerUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowRun" ADD CONSTRAINT "WorkflowRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "public"."WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Communication" ADD CONSTRAINT "Communication_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Communication" ADD CONSTRAINT "Communication_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiAction" ADD CONSTRAINT "AiAction_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "public"."WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CapacitySnapshot" ADD CONSTRAINT "CapacitySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AbsencePeriod" ADD CONSTRAINT "AbsencePeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
