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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` varchar(3) NOT NULL,
	`nameAr` varchar(50) NOT NULL,
	`symbol` varchar(12) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `currencies_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `receipt_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receipt_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_fromCurrencyCode_currencies_code_fk` FOREIGN KEY (`fromCurrencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_toCurrencyCode_currencies_code_fk` FOREIGN KEY (`toCurrencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `currency_transfers` ADD CONSTRAINT `currency_transfers_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_movementCategoryId_movement_categories_id_fk` FOREIGN KEY (`movementCategoryId`) REFERENCES `movement_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_movementCategoryId_movement_categories_id_fk` FOREIGN KEY (`movementCategoryId`) REFERENCES `movement_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `movement_categories` ADD CONSTRAINT `movement_categories_accountCategoryId_account_categories_id_fk` FOREIGN KEY (`accountCategoryId`) REFERENCES `account_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipt_allocations` ADD CONSTRAINT `receipt_allocations_receiptId_receipts_id_fk` FOREIGN KEY (`receiptId`) REFERENCES `receipts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipt_allocations` ADD CONSTRAINT `receipt_allocations_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_movementCategoryId_movement_categories_id_fk` FOREIGN KEY (`movementCategoryId`) REFERENCES `movement_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_categories_kind_idx` ON `account_categories` (`kind`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `cash_movements_currency_date_idx` ON `cash_movements` (`currencyCode`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `cash_movements_source_idx` ON `cash_movements` (`sourceType`,`sourceId`);--> statement-breakpoint
CREATE INDEX `contacts_type_idx` ON `contacts` (`type`);--> statement-breakpoint
CREATE INDEX `contacts_name_idx` ON `contacts` (`name`);--> statement-breakpoint
CREATE INDEX `currency_transfers_date_idx` ON `currency_transfers` (`transferDate`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`movementCategoryId`);--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`expenseDate`);--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoices_contact_idx` ON `invoices` (`contactId`);--> statement-breakpoint
CREATE INDEX `invoices_date_idx` ON `invoices` (`issueDate`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `movement_categories_kind_idx` ON `movement_categories` (`kind`);--> statement-breakpoint
CREATE INDEX `receipt_allocations_receipt_idx` ON `receipt_allocations` (`receiptId`);--> statement-breakpoint
CREATE INDEX `receipt_allocations_invoice_idx` ON `receipt_allocations` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `receipts_contact_idx` ON `receipts` (`contactId`);--> statement-breakpoint
CREATE INDEX `receipts_date_idx` ON `receipts` (`receiptDate`);