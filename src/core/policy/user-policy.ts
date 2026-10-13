import { UserPolicy } from '../domain/schemas';

export const MOCK_USER_POLICY: UserPolicy = {
  maxTransferAmountETH: "1.0",
  allowUnlimitedApproval: false,
  trustedContacts: {
    "alice": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "bob": "0x1111111254fb6c44bac0bed2854e76f90643097d",
    "uniswap": "0x1111111254fb6c44bac0bed2854e76f90643097d",
  },
  tokenApprovalPolicies: {
    // Sepolia USDC (6 decimals, 100 USDC allowance ceiling)
    "11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": {
      chainId: 11155111,
      tokenContractAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      tokenSymbol: "USDC",
      tokenDecimals: 6,
      maxApprovalAmountBaseUnits: "100000000", // 100 USDC
      allowedSpenders: ["0x1111111254fb6c44bac0bed2854e76f90643097d"],
      allowUnlimited: false,
    },
    // Sepolia DAI (18 decimals, 100 DAI allowance ceiling)
    "11155111:0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357": {
      chainId: 11155111,
      tokenContractAddress: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
      tokenSymbol: "DAI",
      tokenDecimals: 18,
      maxApprovalAmountBaseUnits: "100000000000000000000", // 100 DAI
      allowedSpenders: ["0x1111111254fb6c44bac0bed2854e76f90643097d"],
      allowUnlimited: false,
    },
    // Sepolia USDT (6 decimals, 100 USDT allowance ceiling)
    "11155111:0x7169d3882044463f11a3e45775678b78d3845610": {
      chainId: 11155111,
      tokenContractAddress: "0x7169D3882044463f11A3E45775678B78d3845610",
      tokenSymbol: "USDT",
      tokenDecimals: 6,
      maxApprovalAmountBaseUnits: "100000000", // 100 USDT
      allowedSpenders: ["0x1111111254fb6c44bac0bed2854e76f90643097d"],
      allowUnlimited: false,
    },
  },
};
