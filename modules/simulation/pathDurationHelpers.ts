import {AnimationData, PathMap} from "@definitions/simulation/types";
import {Waypoint} from "@definitions/simulation/interfaces";

export function calculatePathLength(path: Waypoint[]): number {
    let pathLength = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const dx = path[i + 1].x - path[i].x;
        const dy = path[i + 1].y - path[i].y;
        pathLength += Math.sqrt(dx * dx + dy * dy);
    }
    return pathLength;
}

export function buildPathMap(asyncAnimationData: AnimationData): PathMap {
    const pathMap: PathMap = {};

    function buildPathMapRec(tokenId: string, currentPathMap: PathMap): number {
        const tokenData = asyncAnimationData[tokenId];
        const currentTokenPath = tokenData.path;
        const currentTokenPathLength = calculatePathLength(currentTokenPath);
        currentPathMap[tokenId] = {path: currentTokenPath, subPaths: {}, onComplete: tokenData.onComplete!};
        let longestSubPath = 0;

        if (!(tokenData.nextTokenIds && tokenData.nextTokenIds.length)) {
            currentPathMap[tokenId].longestSubPathLength = currentTokenPathLength;
        } else {
            const nextTokenIds = tokenData.nextTokenIds || [];
            nextTokenIds.forEach(nextTokenId => {
                const subPathLength = buildPathMapRec(nextTokenId, currentPathMap[tokenId].subPaths);
                longestSubPath = Math.max(longestSubPath, subPathLength);
            });
            currentPathMap[tokenId].longestSubPathLength = currentTokenPathLength + longestSubPath;
        }

        return currentTokenPathLength + longestSubPath;
    }

    const tokenIds = Object.keys(asyncAnimationData).filter(tokenId =>
        !Object.values(asyncAnimationData).some(data => data.nextTokenIds?.includes(tokenId))
    );

    tokenIds.forEach(tokenId => {
        buildPathMapRec(tokenId, pathMap);
    });

    return pathMap;
}

export function calculateDurations(pathMap: PathMap, animatedTokens: Set<string>, overallDuration: number) {
    const durations: Record<string, number> = {};
    const mergingTokenIds = new Array<string>();

    Object.entries(pathMap).forEach(([tokenId, tokenData]) => {
        if (animatedTokens.has(tokenId)) return;

        if (Object.keys(tokenData.subPaths).length === 1) mergingTokenIds.push(tokenId);
        else durations[tokenId] = calculatePathLength(tokenData.path) * overallDuration / tokenData.longestSubPathLength!;
    });

    if (mergingTokenIds.length) {
        const tokenIdWithLongestPath = mergingTokenIds.reduce((longestPathTokenId, tokenId) =>
            pathMap[tokenId].longestSubPathLength! > pathMap[longestPathTokenId].longestSubPathLength! ? tokenId : longestPathTokenId
        );
        const longestPath = pathMap[tokenIdWithLongestPath].longestSubPathLength!;
        const tokenWithLongestPathSegmentLength = calculatePathLength(pathMap[tokenIdWithLongestPath].path);
        const tokenWithLongestPathDuration = overallDuration * tokenWithLongestPathSegmentLength / longestPath;
        const tokenWithLongestPathRemainingPathLength = longestPath - tokenWithLongestPathSegmentLength;
        const tokenWithLongestPathRemainingDuration = overallDuration - tokenWithLongestPathDuration;

        mergingTokenIds.forEach(tokenId => {
            const segmentLength = calculatePathLength(pathMap[tokenId].path);
            const remainingPathLength = pathMap[tokenId].longestSubPathLength! - segmentLength;
            const currentRemainingDuration = remainingPathLength * tokenWithLongestPathRemainingDuration / tokenWithLongestPathRemainingPathLength;
            durations[tokenId] = overallDuration - currentRemainingDuration;
        });
    }

    return durations;
}

