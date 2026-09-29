CREATE TABLE `individual_subscription_cash_balances` (
	`currencyCode` varchar(3) NOT NULL,
	`balance` decimal(18,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `individual_subscription_cash_balances_currencyCode` PRIMARY KEY(`currencyCode`)
);
--> statement-breakpoint
CREATE TABLE `individual_subscription_cash_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`direction` enum('in','out') NOT NULL,
	`type` enum('payment','opening_balance','refund') NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`sourcePaymentId` int,
	`occurredAt` timestamp NOT NULL,
	`description` varchar(300) NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `individual_subscription_cash_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `individual_subscription_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`subscriptionId` int,
	`description` varchar(200) NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`paidAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`status` enum('unpaid','partial','paid','cancelled') NOT NULL DEFAULT 'unpaid',
	`chargedAt` timestamp NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `individual_subscription_charges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `individual_subscription_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`chargeId` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `individual_subscription_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `individual_subscription_cash_balances` ADD CONSTRAINT `ind_cash_bal_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_cash_movements` ADD CONSTRAINT `ind_cash_mov_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_cash_movements` ADD CONSTRAINT `ind_cash_mov_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_cash_movements` ADD CONSTRAINT `ind_cash_payment_fk` FOREIGN KEY (`sourcePaymentId`) REFERENCES `individual_subscription_payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_sub_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `individual_subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_charge_fk` FOREIGN KEY (`chargeId`) REFERENCES `individual_subscription_charges`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ind_cash_date_idx` ON `individual_subscription_cash_movements` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `ind_cash_currency_idx` ON `individual_subscription_cash_movements` (`currencyCode`);--> statement-breakpoint
CREATE INDEX `ind_charge_account_idx` ON `individual_subscription_charges` (`accountId`);--> statement-breakpoint
CREATE INDEX `ind_charge_status_idx` ON `individual_subscription_charges` (`status`);--> statement-breakpoint
CREATE INDEX `ind_charge_date_idx` ON `individual_subscription_charges` (`chargedAt`);--> statement-breakpoint
CREATE INDEX `ind_pay_account_idx` ON `individual_subscription_payments` (`accountId`);--> statement-breakpoint
CREATE INDEX `ind_pay_charge_idx` ON `individual_subscription_payments` (`chargeId`);--> statement-breakpoint
CREATE INDEX `ind_pay_date_idx` ON `individual_subscription_payments` (`paymentDate`);