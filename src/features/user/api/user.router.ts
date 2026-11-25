import {
  listUserForSearchProcedure,
  listUserProcedure,
  profileUpdateProcedure,
  updateUserRoleProcedure,
  userBanProcedure,
  userDetailsProcedure,
  userImpl,
  userStatsProcedure,
} from "./user.procedure";

export const userRouter = userImpl.router({
  list: listUserProcedure,
  listForSearch: listUserForSearchProcedure,
  stats: userStatsProcedure,
  updateRole: updateUserRoleProcedure,
  ban: userBanProcedure,
  updateProfile: profileUpdateProcedure,
  details: userDetailsProcedure,
});
