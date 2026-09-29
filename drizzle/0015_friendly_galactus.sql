ALTER TABLE `expenses` ADD `allowCashOverdraft` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `cashOverrideReason` varchar(500);