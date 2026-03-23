import { createMySQLConnection } from "../mysql/typeorm";
import { Process } from "../entities/Process";
import { Event } from "../entities/Event";
import { Frame } from "../entities/Frame";
import axios from "axios";

async function cleanupOldProcesses() {
    console.log('Starting nightly process cleanup...');

    const appDataSource = await createMySQLConnection();
    const processRepository = appDataSource.getRepository(Process);

    try {
        // Calculate date 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        console.log(`Looking for processes last accessed before: ${thirtyDaysAgo.toISOString()}`);

        // Step 1: Find processes older than 30 days that haven't been marked for deletion yet
        const oldProcesses = await processRepository
            .createQueryBuilder("process")
            .where("process.lastAccessedAt < :thirtyDaysAgo", { thirtyDaysAgo })
            .andWhere("process.setToDelete = :setToDelete", { setToDelete: false })
            .getMany();

        console.log(`Found ${oldProcesses.length} processes to mark for deletion`);

        if (oldProcesses.length === 0) {
            console.log('No processes to clean up');
            return;
        }

        // Step 2: Mark processes for deletion (setToDelete = true)
        const processIds = oldProcesses.map(p => p.id);
        await processRepository
            .createQueryBuilder()
            .update(Process)
            .set({ setToDelete: true })
            .where("id IN (:...processIds)", { processIds })
            .execute();

        console.log(`Marked ${processIds.length} processes for deletion`);

        // Step 3: Call Python API to delete ngrams for each process
        const pythonBaseUrl = process.env.PYTHON_MICROSERVICE_BASE_URL;
        if (!pythonBaseUrl) {
            throw new Error('PYTHON_MICROSERVICE_BASE_URL environment variable not set');
        }

        const successfullyDeletedFromPython: string[] = [];

        for (const processId of processIds) {
            try {
                console.log(`Calling Python API to delete ngrams for process: ${processId}`);
                const response = await axios.delete(`${pythonBaseUrl}/delete/${processId}`);

                if (response.status === 200) {
                    successfullyDeletedFromPython.push(processId);
                    console.log(`Successfully deleted ngrams for process: ${processId}`);
                } else {
                    console.error(`Failed to delete ngrams for process ${processId}: HTTP ${response.status}`);
                }
            } catch (error) {
                console.error(`Error calling Python API for process ${processId}:`, error.message);
            }
        }

        // Step 4: Delete database records for processes successfully deleted from Python
        if (successfullyDeletedFromPython.length > 0) {
            console.log(`Deleting database records for ${successfullyDeletedFromPython.length} processes`);

            // Use transaction to ensure all deletions succeed or all fail
            await appDataSource.transaction(async (transactionalEntityManager) => {
                console.log(`Starting transaction for process IDs: ${successfullyDeletedFromPython.join(', ')}`);
                
                // Delete events
                const eventsDeleted = await transactionalEntityManager
                    .createQueryBuilder()
                    .delete()
                    .from(Event)
                    .where("processId IN (:...processIds)", { processIds: successfullyDeletedFromPython })
                    .execute();
                console.log(`Deleted ${eventsDeleted.affected} related events`);

                // Delete frames
                const framesDeleted = await transactionalEntityManager
                    .createQueryBuilder()
                    .delete()
                    .from(Frame)
                    .where("processId IN (:...processIds)", { processIds: successfullyDeletedFromPython })
                    .execute();
                console.log(`Deleted ${framesDeleted.affected} related frames`);

                // Delete processes
                const processesDeleted = await transactionalEntityManager
                    .createQueryBuilder()
                    .delete()
                    .from(Process)
                    .where("id IN (:...processIds)", { processIds: successfullyDeletedFromPython })
                    .execute();
                console.log(`Deleted ${processesDeleted.affected} process records`);
                
                console.log('Transaction completed successfully');
            });

            console.log(`Successfully cleaned up ${successfullyDeletedFromPython.length} processes`);
        }

        // Log processes that failed Python deletion (still marked for deletion)
        const failedPythonDeletion = processIds.filter(id => !successfullyDeletedFromPython.includes(id));
        if (failedPythonDeletion.length > 0) {
            console.warn(`${failedPythonDeletion.length} processes marked for deletion but Python API failed - will retry next run`);
        }

    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    } finally {
        await appDataSource.destroy();
    }
}

// Run the cleanup
cleanupOldProcesses()
    .then(() => {
        console.log('Nightly cleanup completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Nightly cleanup failed:', error);
        process.exit(1);
    });
