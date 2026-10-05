CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);

;
CREATE TABLE `account_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`kind` enum('income','expense','asset','liability','equity','other') NOT NULL,
	`isSystem` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `account_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_categories_name_kind_unique` UNIQUE(`name`,`kind`)
);
;
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
;
CREATE TABLE `cash_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`direction` enum('in','out') NOT NULL,
	`type` enum('opening_balance','cash_invoice','receipt','expense','transfer_in','transfer_out','adjustment') NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`sourceType` varchar(40),
	`sourceId` int,
	`description` varchar(300),
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_movements_id` PRIMARY KEY(`id`)
);
;
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`type` enum('customer','market','supplier','employee','other') NOT NULL DEFAULT 'customer',
	`phone` varchar(32),
	`address` varchar(300),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
;
CREATE TABLE `currencies` (
	`code` varchar(3) NOT NULL,
	`nameAr` varchar(50) NOT NULL,
	`symbol` varchar(12) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `currencies_code` PRIMARY KEY(`code`)
);
;
CREATE TABLE `currency_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transferNumber` varchar(40) NOT NULL,
	`transferDate` timestamp NOT NULL,
	`fromCurrencyCode` varchar(3) NOT NULL,
	`fromAmount` decimal(18,2) NOT NULL,
	`toCurrencyCode` varchar(3) NOT NULL,
	`toAmount` decimal(18,2) NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `currency_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `currency_transfers_number_unique` UNIQUE(`transferNumber`)
);
;
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`expenseNumber` varchar(40) NOT NULL,
	`contactId` int,
	`movementCategoryId` int,
	`status` enum('active','cancelled') NOT NULL DEFAULT 'active',
	`expenseDate` timestamp NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`exchangeRateToBase` decimal(18,6) NOT NULL DEFAULT '1',
	`amount` decimal(18,2) NOT NULL,
	`description` varchar(300) NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `expenses_number_unique` UNIQUE(`expenseNumber`)
);
;
CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`description` varchar(300) NOT NULL,
	`quantity` decimal(14,3) NOT NULL DEFAULT '1',
	`unitPrice` decimal(18,2) NOT NULL,
	`totalAmount` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
;
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(40) NOT NULL,
	`contactId` int NOT NULL,
	`movementCategoryId` int,
	`type` enum('cash','credit') NOT NULL,
	`status` enum('issued','partially_paid','paid','cancelled') NOT NULL DEFAULT 'issued',
	`issueDate` timestamp NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`exchangeRateToBase` decimal(18,6) NOT NULL DEFAULT '1',
	`subtotal` decimal(18,2) NOT NULL,
	`discountAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`totalAmount` decimal(18,2) NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_number_unique` UNIQUE(`invoiceNumber`)
);
;
CREATE TABLE `movement_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`kind` enum('sale','receipt','expense','transfer','adjustment') NOT NULL,
	`accountCategoryId` int,
	`isSystem` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `movement_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `movement_categories_name_kind_unique` UNIQUE(`name`,`kind`)
);
;
CREATE TABLE `receipt_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receipt_allocations_id` PRIMARY KEY(`id`)
);
;
CREATE TABLE `receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptNumber` varchar(40) NOT NULL,
	`contactId` int NOT NULL,
	`movementCategoryId` int,
	`status` enum('active','cancelled') NOT NULL DEFAULT 'active',
	`receiptDate` timestamp NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`exchangeRateToBase` decimal(18,6) NOT NULL DEFAULT '1',
	`amount` decimal(18,2) NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `receipts_number_unique` UNIQUE(`receiptNumber`)
);
;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_fromCurrencyCode_currencies_code_fk` FOREIGN KEY (`fromCurrencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_toCurrencyCode_currencies_code_fk` FOREIGN KEY (`toCurrencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_movementCategoryId_movement_categories_id_fk` FOREIGN KEY (`movementCategoryId`) REFERENCES `movement_categories`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_movementCategoryId_movement_categories_id_fk` FOREIGN KEY (`movementCategoryId`) REFERENCES `movement_categories`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `movement_categories` ADD CONSTRAINT `movement_categories_accountCategoryId_account_categories_id_fk` FOREIGN KEY (`accountCategoryId`) REFERENCES `account_categories`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `receipt_allocations` ADD CONSTRAINT `receipt_allocations_receiptId_receipts_id_fk` FOREIGN KEY (`receiptId`) REFERENCES `receipts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `receipt_allocations` ADD CONSTRAINT `receipt_allocations_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_movementCategoryId_movement_categories_id_fk` FOREIGN KEY (`movementCategoryId`) REFERENCES `movement_categories`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `account_categories_kind_idx` ON `account_categories` (`kind`);;
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entityType`,`entityId`);;
CREATE INDEX `cash_movements_currency_date_idx` ON `cash_movements` (`currencyCode`,`occurredAt`);;
CREATE INDEX `cash_movements_source_idx` ON `cash_movements` (`sourceType`,`sourceId`);;
CREATE INDEX `contacts_type_idx` ON `contacts` (`type`);;
CREATE INDEX `contacts_name_idx` ON `contacts` (`name`);;
CREATE INDEX `currency_transfers_date_idx` ON `currency_transfers` (`transferDate`);;
CREATE INDEX `expenses_category_idx` ON `expenses` (`movementCategoryId`);;
CREATE INDEX `expenses_date_idx` ON `expenses` (`expenseDate`);;
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoiceId`);;
CREATE INDEX `invoices_contact_idx` ON `invoices` (`contactId`);;
CREATE INDEX `invoices_date_idx` ON `invoices` (`issueDate`);;
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);;
CREATE INDEX `movement_categories_kind_idx` ON `movement_categories` (`kind`);;
CREATE INDEX `receipt_allocations_receipt_idx` ON `receipt_allocations` (`receiptId`);;
CREATE INDEX `receipt_allocations_invoice_idx` ON `receipt_allocations` (`invoiceId`);;
CREATE INDEX `receipts_contact_idx` ON `receipts` (`contactId`);;
CREATE INDEX `receipts_date_idx` ON `receipts` (`receiptDate`);
;
CREATE TABLE `backup_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(512) NOT NULL,
	`sizeBytes` int NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backup_snapshots_id` PRIMARY KEY(`id`)
);
;
ALTER TABLE `backup_snapshots` ADD CONSTRAINT `backup_snapshots_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `backup_snapshots_created_idx` ON `backup_snapshots` (`createdAt`);
;
CREATE TABLE `service_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`durationDays` int NOT NULL DEFAULT 30,
	`price` decimal(18,2) NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_packages_id` PRIMARY KEY(`id`)
);
;
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`packageId` int,
	`packageName` varchar(160) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`status` enum('active','expiring','expired','suspended') NOT NULL DEFAULT 'active',
	`notes` text,
	`invoiceId` int,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
;
ALTER TABLE `service_packages` ADD CONSTRAINT `service_packages_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_packageId_service_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `service_packages`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `service_packages_active_idx` ON `service_packages` (`isActive`);;
CREATE INDEX `subscriptions_contact_idx` ON `subscriptions` (`contactId`);;
CREATE INDEX `subscriptions_status_end_idx` ON `subscriptions` (`status`,`endDate`);
;
ALTER TABLE `expenses` ADD `supplierName` varchar(200);;
ALTER TABLE `expenses` ADD `supplierInvoiceNumber` varchar(120);;
ALTER TABLE `expenses` ADD `attachmentName` varchar(255);;
ALTER TABLE `expenses` ADD `attachmentKey` varchar(512);;
ALTER TABLE `expenses` ADD `attachmentUrl` varchar(512);
;
CREATE TABLE `cash_balances` (
	`currencyCode` varchar(3) NOT NULL,
	`balance` decimal(18,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_balances_currencyCode` PRIMARY KEY(`currencyCode`)
);
;
ALTER TABLE `cash_balances` ADD CONSTRAINT `cash_balances_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;
;
ALTER TABLE `invoices` ADD `paidAmount` decimal(18,2) DEFAULT '0' NOT NULL;
;
CREATE TABLE `backup_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int NOT NULL,
	`cronTaskUid` varchar(65),
	`cronExpression` varchar(64) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`lastSuccessAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backup_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `backup_schedules_cronTaskUid_unique` UNIQUE(`cronTaskUid`),
	CONSTRAINT `backup_schedules_owner_unique` UNIQUE(`createdByUserId`)
);
;
ALTER TABLE `backup_snapshots` ADD `source` enum('manual','automatic','protective') DEFAULT 'manual' NOT NULL;;
ALTER TABLE `backup_schedules` ADD CONSTRAINT `backup_schedules_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `backup_schedules_task_uid_idx` ON `backup_schedules` (`cronTaskUid`);
;
CREATE TABLE `backup_schedule_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleId` int NOT NULL,
	`runDate` varchar(10) NOT NULL,
	`status` enum('running','success','failed') NOT NULL DEFAULT 'running',
	`snapshotId` int,
	`error` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `backup_schedule_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `backup_schedule_runs_schedule_date_unique` UNIQUE(`scheduleId`,`runDate`)
);
;
ALTER TABLE `backup_schedules` ADD `lastSuccessDate` varchar(10);;
ALTER TABLE `backup_schedule_runs` ADD CONSTRAINT `backup_schedule_runs_scheduleId_backup_schedules_id_fk` FOREIGN KEY (`scheduleId`) REFERENCES `backup_schedules`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `backup_schedule_runs` ADD CONSTRAINT `backup_schedule_runs_snapshotId_backup_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `backup_snapshots`(`id`) ON DELETE no action ON UPDATE no action;
;
CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`whatsappTemplate` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_owner_unique` UNIQUE(`ownerUserId`)
);
;
ALTER TABLE `app_settings` ADD CONSTRAINT `app_settings_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
;
ALTER TABLE `contacts` MODIFY COLUMN `type` enum('customer','market','grocery','supplier','employee','other') NOT NULL DEFAULT 'customer';
;
CREATE TABLE `individual_subscription_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`phone` varchar(32),
	`status` enum('active','suspended','closed') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `individual_subscription_accounts_id` PRIMARY KEY(`id`)
);
;
CREATE TABLE `individual_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`status` enum('active','suspended','cancelled') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `individual_subscriptions_id` PRIMARY KEY(`id`)
);
;
ALTER TABLE `individual_subscription_accounts` ADD CONSTRAINT `individual_subscription_accounts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

;
ALTER TABLE `individual_subscriptions` ADD CONSTRAINT `ind_subs_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscriptions` ADD CONSTRAINT `individual_subscriptions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `individual_subscription_accounts_name_idx` ON `individual_subscription_accounts` (`name`);;
CREATE INDEX `individual_subscription_accounts_status_idx` ON `individual_subscription_accounts` (`status`);;
CREATE INDEX `individual_subscriptions_account_idx` ON `individual_subscriptions` (`accountId`);;
CREATE INDEX `individual_subscriptions_status_idx` ON `individual_subscriptions` (`status`);


;
CREATE TABLE `individual_subscription_cash_balances` (
	`currencyCode` varchar(3) NOT NULL,
	`balance` decimal(18,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `individual_subscription_cash_balances_currencyCode` PRIMARY KEY(`currencyCode`)
);
;
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
;
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
;
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
;
ALTER TABLE `individual_subscription_cash_balances` ADD CONSTRAINT `ind_cash_bal_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_cash_movements` ADD CONSTRAINT `ind_cash_mov_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_cash_movements` ADD CONSTRAINT `ind_cash_mov_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_cash_movements` ADD CONSTRAINT `ind_cash_payment_fk` FOREIGN KEY (`sourcePaymentId`) REFERENCES `individual_subscription_payments`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_charges` ADD CONSTRAINT `ind_charge_sub_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `individual_subscriptions`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_payments` ADD CONSTRAINT `ind_pay_charge_fk` FOREIGN KEY (`chargeId`) REFERENCES `individual_subscription_charges`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `ind_cash_date_idx` ON `individual_subscription_cash_movements` (`occurredAt`);;
CREATE INDEX `ind_cash_currency_idx` ON `individual_subscription_cash_movements` (`currencyCode`);;
CREATE INDEX `ind_charge_account_idx` ON `individual_subscription_charges` (`accountId`);;
CREATE INDEX `ind_charge_status_idx` ON `individual_subscription_charges` (`status`);;
CREATE INDEX `ind_charge_date_idx` ON `individual_subscription_charges` (`chargedAt`);;
CREATE INDEX `ind_pay_account_idx` ON `individual_subscription_payments` (`accountId`);;
CREATE INDEX `ind_pay_charge_idx` ON `individual_subscription_payments` (`chargeId`);;
CREATE INDEX `ind_pay_date_idx` ON `individual_subscription_payments` (`paymentDate`);
;
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
;
ALTER TABLE `individual_subscription_charges` ADD `discountAmount` decimal(18,2) DEFAULT '0' NOT NULL;;
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_currency_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `individual_subscription_adjustments` ADD CONSTRAINT `ind_adj_charge_fk` FOREIGN KEY (`chargeId`) REFERENCES `individual_subscription_charges`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `ind_adj_account_idx` ON `individual_subscription_adjustments` (`accountId`);;
CREATE INDEX `ind_adj_charge_idx` ON `individual_subscription_adjustments` (`chargeId`);;
CREATE INDEX `ind_adj_date_idx` ON `individual_subscription_adjustments` (`adjustmentDate`);
;
ALTER TABLE `expenses` ADD `allowCashOverdraft` boolean DEFAULT false NOT NULL;;
ALTER TABLE `expenses` ADD `cashOverrideReason` varchar(500);
;
ALTER TABLE `contacts` MODIFY COLUMN `type` enum('customer','grocery','supplier','employee','other') NOT NULL DEFAULT 'customer';
;
CREATE TABLE `cash_account_balances` (
	`cashAccountId` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`balance` decimal(18,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_account_balances_cashAccountId_currencyCode_pk` PRIMARY KEY(`cashAccountId`,`currencyCode`)
);
;
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
;
ALTER TABLE `cash_movements` ADD `cashAccountId` int;;
ALTER TABLE `currency_transfers` ADD `fromCashAccountId` int;;
ALTER TABLE `currency_transfers` ADD `toCashAccountId` int;;
ALTER TABLE `expenses` ADD `cashAccountId` int;;
ALTER TABLE `invoices` ADD `cashAccountId` int;;
ALTER TABLE `receipts` ADD `cashAccountId` int;;
ALTER TABLE `cash_account_balances` ADD CONSTRAINT `cash_account_balances_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `cash_account_balances` ADD CONSTRAINT `cash_account_balances_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `cash_accounts` ADD CONSTRAINT `cash_accounts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `cash_account_balances_currency_idx` ON `cash_account_balances` (`currencyCode`);;
CREATE INDEX `cash_accounts_type_active_idx` ON `cash_accounts` (`type`,`isActive`);;
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_fromCashAccountId_cash_accounts_id_fk` FOREIGN KEY (`fromCashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_toCashAccountId_cash_accounts_id_fk` FOREIGN KEY (`toCashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_cashAccountId_cash_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;;
CREATE INDEX `cash_movements_account_date_idx` ON `cash_movements` (`cashAccountId`,`occurredAt`);
