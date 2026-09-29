ALTER TABLE `individual_subscriptions` ADD CONSTRAINT `ind_subs_account_fk` FOREIGN KEY (`accountId`) REFERENCES `individual_subscription_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `individual_subscriptions` ADD CONSTRAINT `individual_subscriptions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `individual_subscription_accounts_name_idx` ON `individual_subscription_accounts` (`name`);--> statement-breakpoint
CREATE INDEX `individual_subscription_accounts_status_idx` ON `individual_subscription_accounts` (`status`);--> statement-breakpoint
CREATE INDEX `individual_subscriptions_account_idx` ON `individual_subscriptions` (`accountId`);--> statement-breakpoint
CREATE INDEX `individual_subscriptions_status_idx` ON `individual_subscriptions` (`status`);

