export const mockJsonResponse = (body: unknown, init?: { status?: number }) => ({
    body,
    status: init?.status ?? 200,
});

export const createQueryBuilderMock = <T>(result: T) => {
    return {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(result),
        getRawOne: jest.fn().mockResolvedValue(result),
        getRawMany: jest.fn().mockResolvedValue(result),
    };
};

