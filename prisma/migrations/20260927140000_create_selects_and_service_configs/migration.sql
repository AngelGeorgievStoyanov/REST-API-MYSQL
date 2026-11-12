-- CreateTable
CREATE TABLE `select_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `uq_select_types_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `select_options` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `selectTypeId` INTEGER NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `uq_select_options_type_key`(`selectTypeId`, `key`),
    UNIQUE INDEX `uq_select_options_type_sort`(`selectTypeId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `uq_service_types_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serviceTypeId` INTEGER NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `value` VARCHAR(1000) NOT NULL,
    `type` ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `uq_service_configs_type_key`(`serviceTypeId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `select_options` ADD CONSTRAINT `fk_select_options_type` FOREIGN KEY (`selectTypeId`) REFERENCES `select_types`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `service_configs` ADD CONSTRAINT `fk_service_configs_type` FOREIGN KEY (`serviceTypeId`) REFERENCES `service_types`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
