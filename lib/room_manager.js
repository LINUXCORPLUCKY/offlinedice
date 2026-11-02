// ==============================================================================
// HEADLESS DICE — INDIVIDUAL USER ROOM ALLOCATION & ISOLATION MANAGER
// Strict Cross-User Boundary Enforcement & Prediction History Isolation
// ==============================================================================

const { getDb } = require('./db');

/**
 * Retrieves the dedicated room document for an authenticated user.
 * Strictly verifies ownership; denies access if session does not match room owner.
 */
async function getRoomForSession(roomId, session) {
  if (!session || !session.userId) {
    return { success: false, status: 401, error: 'Unauthorized: Session required' };
  }

  const { db } = await getDb();
  const roomsCol = db.collection('user_rooms');

  const cleanRoomId = (roomId || '').trim();
  if (!cleanRoomId) {
    return { success: false, status: 400, error: 'Room identifier is required' };
  }

  const room = await roomsCol.findOne({ roomId: cleanRoomId });
  if (!room) {
    return { success: false, status: 404, error: 'Room not found' };
  }

  // Cross-User Isolation Guard
  // Owners can inspect room telemetry, but regular users can ONLY access their own room
  const isOwner = session.role === 'OWNER';
  const isDirectOwner = (room.licenseKey && room.licenseKey === session.licenseKey) ||
                        (room.userId && room.userId.toString() === session.userId.toString());

  if (!isOwner && !isDirectOwner) {
    return {
      success: false,
      status: 403,
      error: 'Access Denied: You do not possess authorization for this room.'
    };
  }

  return {
    success: true,
    room: {
      roomId: room.roomId,
      roomName: room.roomName,
      rollsState: room.rollsState,
      predictionHistory: room.predictionHistory || [],
      settings: room.settings || { soundEnabled: true, theme: 'cyber_purple' },
      updatedAt: room.updatedAt
    }
  };
}

/**
 * Updates dice rolls and saves prediction target for an authenticated user room.
 */
async function updateRoomState(roomId, session, { rollsState, prediction }) {
  if (!session || !session.userId) {
    return { success: false, status: 401, error: 'Unauthorized: Session required' };
  }

  const { db } = await getDb();
  const roomsCol = db.collection('user_rooms');

  const cleanRoomId = (roomId || '').trim();
  const room = await roomsCol.findOne({ roomId: cleanRoomId });
  if (!room) {
    return { success: false, status: 404, error: 'Room not found' };
  }

  const isOwner = session.role === 'OWNER';
  const isDirectOwner = (room.licenseKey && room.licenseKey === session.licenseKey) ||
                        (room.userId && room.userId.toString() === session.userId.toString());

  if (!isOwner && !isDirectOwner) {
    return {
      success: false,
      status: 403,
      error: 'Forbidden: Cannot modify rooms belonging to other users.'
    };
  }

  const updateFields = { updatedAt: new Date() };

  if (Array.isArray(rollsState)) {
    updateFields.rollsState = rollsState;
  }

  let pushUpdate = null;
  if (prediction && prediction.topColor) {
    const historyItem = {
      topColor: prediction.topColor,
      topProbability: prediction.topProbability,
      secondColor: prediction.secondColor,
      secondProbability: prediction.secondProbability,
      timestamp: Date.now()
    };
    pushUpdate = {
      $push: {
        predictionHistory: {
          $each: [historyItem],
          $slice: -50 // Retain last 50 historical predictions
        }
      }
    };
  }

  await roomsCol.updateOne(
    { _id: room._id },
    { $set: updateFields, ...(pushUpdate || {}) }
  );

  return { success: true, message: 'Room state updated successfully' };
}

module.exports = {
  getRoomForSession,
  updateRoomState
};
