CREATE TABLE `cash_account_balances` (
	`cashAccountId` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`balance` decimal(18,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_account_balances_cashAccountId_currencyCode_pk` PRIMARY KEY(`cashAccountId`,`currencyCode`)
);
--> statement-breakpoint
CREATE TABLE `cash_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('cash','bank') NOT NULL,
	`isSystem` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_accounts_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `cash_movements` ADD `cashAccountId` int;--> statement-breakpoint
ALTER TABLE `currency_transfers` ADD `fromCashAccountId` int;--> statement-breakpoint
ALTER TABLE `currency_transfers` ADD `toCashAccountId` int;--> statement-breakpoint
ALTER TABLE `expenses` ADD `cashAccountId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `cashAccountId` int;--> statement-breakpoint
ALTER TABLE `receipts` ADD `cashAccountId` int;--> statement-breakpoint
ALTER TABLE `cash_account_balances` ADD CONSTRAINT `cash_account_balances_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_account_balances` ADD CONSTRAINT `cash_account_balances_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_accounts` ADD CONSTRAINT `cash_accounts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_account_balances_currency_idx` ON `cash_account_balances` (`currencyCode`);--> statement-breakpoint
CREATE INDEX `cash_accounts_type_active_idx` ON `cash_accounts` (`type`,`isActive`);--> statement-breakpoint
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_fromCashAccountId_cash_accounts_id_fk` FOREIGN KEY (`fromCashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_toCashAccountId_cash_accounts_id_fk` FOREIGN KEY (`toCashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_movements_account_date_idx` ON `cash_movements` (`cashAccountId`,`occurredAt`);