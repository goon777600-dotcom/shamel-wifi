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
--> statement-breakpoint
ALTER TABLE `backup_schedules` ADD `lastSuccessDate` varchar(10);--> statement-breakpoint
ALTER TABLE `backup_schedule_runs` ADD CONSTRAINT `backup_schedule_runs_scheduleId_backup_schedules_id_fk` FOREIGN KEY (`scheduleId`) REFERENCES `backup_schedules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `backup_schedule_runs` ADD CONSTRAINT `backup_schedule_runs_snapshotId_backup_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `backup_snapshots`(`id`) ON DELETE no action ON UPDATE no action;