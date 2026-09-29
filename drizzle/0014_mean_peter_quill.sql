CREATE TABLE `individual_subscription_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`chargeId` int NOT NULL,
	`type` enum('discount') NOT NULL DEFAULT 'discount',
	`currencyCode` varchar(3) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`adjustmentDate` timestamp NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `individual_subscription_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `individual_subscription_charges` ADD `discountAmount` decimal(18,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_charge_fk` FOREIGN KEY (`chargeId`) REFERENCES `individual_subscription_charges`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ind_adj_account_idx` ON `individual_subscription_adjustments` (`accountId`);--> statement-breakpoint
CREATE INDEX `ind_adj_charge_idx` ON `individual_subscription_adjustments` (`chargeId`);--> statement-breakpoint
CREATE INDEX `ind_adj_date_idx` ON `individual_subscription_adjustments` (`adjustmentDate`);