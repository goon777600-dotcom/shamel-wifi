CREATE TABLE `cash_balances` (
	`currencyCode` varchar(3) NOT NULL,
	`balance` decimal(18,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_balances_currencyCode` PRIMARY KEY(`currencyCode`)
);
--> statement-breakpoint
ALTER TABLE `cash_balances` ADD CONSTRAINT `cash_balances_currencyCode_currencies_code_fk` FOREIGN KEY (`currencyCode`) REFERENCES `currencies`(`code`) ON DELETE no action ON UPDATE no action;