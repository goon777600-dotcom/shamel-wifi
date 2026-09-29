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
--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD `source` enum('manual','automatic','protective') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `backup_schedules` ADD CONSTRAINT `backup_schedules_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `backup_schedules_task_uid_idx` ON `backup_schedules` (`cronTaskUid`);