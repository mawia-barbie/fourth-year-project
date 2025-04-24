import { useState, useEffect } from "react";
import { ethers } from "ethers";
import LicenseManagerArtifact from "./LicenseManager.json";

function AdminPage() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState({});

  const contractAddress = "0xNewAddress"; // TODO: Replace with new deployed address
  const contractABI = LicenseManagerArtifact.abi;

  async function getContract() {
    if (!window.ethereum) {
      setStatus("Please install MetaMask!");
      return null;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum, {
        chainId: 1337,
        name: "ganache",
        ensAddress: null,
      });

      await window.ethereum.request({ method: "eth_requestAccounts" });

      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      console.log("Signer address:", signerAddress);

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 1337) {
        setStatus("Please connect MetaMask to Ganache (chainId 1337)");
        return null;
      }

      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      return { contract, signer, signerAddress };
    } catch (error) {
      setStatus(`Error connecting to blockchain: ${error.message}`);
      console.error("getContract error:", error);
      return null;
    }
  }

  async function fetchUsers() {
    const contractData = await getContract();
    if (!contractData) return;

    const { contract, signerAddress } = contractData;
    try {
      const adminAddress = await contract.admin();
      if (signerAddress.toLowerCase() !== adminAddress.toLowerCase()) {
        setStatus("You are not the admin!");
        return;
      }
      setIsAdmin(true);

      // Fetch users by listening to UserRegistered events
      const filter = contract.filters.UserRegistered();
      const events = await contract.queryFilter(filter);
      const userAddresses = events.map((event) => event.args.user);

      const userData = await Promise.all(
        userAddresses.map(async (user) => {
          const [isRegistered, isApproved, isRejected, rejectionReason] = await contract.getUserStatus(user);
          return { address: user, isRegistered, isApproved, isRejected, rejectionReason };
        })
      );

      setUsers(userData);
      console.log("Fetched users:", userData);
    } catch (error) {
      setStatus(`Error fetching users: ${error.message}`);
      console.error("fetchUsers error:", error);
    }
  }

  async function approveUser(userAddress) {
    const contractData = await getContract();
    if (!contractData) return;

    const { contract } = contractData;
    setLoading(true);
    try {
      const tx = await contract.approveUser(userAddress, { gasLimit: 300000 });
      await tx.wait();
      setStatus(`User ${userAddress} approved`);
      fetchUsers();
    } catch (error) {
      let errorMessage = error.message;
      if (error.data && error.data.message) errorMessage = error.data.message;
      else if (error.reason) errorMessage = error.reason;
      setStatus(`Error approving user: ${errorMessage}`);
      console.error("approveUser error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function rejectUser(userAddress) {
    const reason = rejectionReasons[userAddress]?.trim();
    if (!reason) {
      setStatus("Please provide a rejection reason");
      return;
    }

    const contractData = await getContract();
    if (!contractData) return;

    const { contract } = contractData;
    setLoading(true);
    try {
      const tx = await contract.rejectUser(userAddress, reason, { gasLimit: 300000 });
      await tx.wait();
      setStatus(`User ${userAddress} rejected`);
      setRejectionReasons((prev) => ({ ...prev, [userAddress]: "" }));
      fetchUsers();
    } catch (error) {
      let errorMessage = error.message;
      if (error.data && error.data.message) errorMessage = error.data.message;
      else if (error.reason) errorMessage = error.reason;
      setStatus(`Error rejecting user: ${errorMessage}`);
      console.error("rejectUser error:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-12 w-full max-w-4xl transform transition-all hover:scale-105">
          <h1 className="text-5xl font-extrabold text-center text-pink-800 mb-10">
            Admin Panel
          </h1>
          <p className="text-xl text-red-600 text-center mb-8">
            Access denied. Only the admin can view this page.
          </p>
          {status && (
            <p className="text-xl text-gray-700 text-center break-words">
              <span className="font-semibold">Status:</span> {status}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-12 w-full max-w-4xl transform transition-all hover:scale-105">
        <h1 className="text-5xl font-extrabold text-center text-pink-800 mb-10">
          Admin Panel
        </h1>

        {loading && (
          <div className="flex justify-center mb-8">
            <svg className="animate-spin h-8 w-8 text-pink-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        )}

        <h2 className="text-3xl font-semibold text-gray-800 mb-6">Registered Users</h2>
        {users.length === 0 ? (
          <p className="text-xl text-gray-700 text-center">No registered users.</p>
        ) : (
          <div className="space-y-4">
            {users.map((user) => (
              <div key={user.address} className="border border-pink-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-gray-700 break-all">
                    {user.address}
                  </p>
                  <p className="text-lg text-gray-600">
                    Status: {user.isApproved ? "Approved" : user.isRejected ? "Rejected" : "Pending"}
                  </p>
                  {user.isRejected && (
                    <p className="text-lg text-red-600 break-words">
                      Reason: {user.rejectionReason}
                    </p>
                  )}
                </div>
                {!user.isApproved && !user.isRejected && (
                  <div className="flex space-x-4">
                    <button
                      onClick={() => approveUser(user.address)}
                      className="bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white text-lg py-2 px-4 rounded-xl hover:from-fuchsia-600 hover:to-pink-700 focus:outline-none focus:ring-4 focus:ring-fuchsia-400 transition-all duration-300 disabled:opacity-50"
                      disabled={loading}
                    >
                      Approve
                    </button>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={rejectionReasons[user.address] || ""}
                        onChange={(e) =>
                          setRejectionReasons((prev) => ({
                            ...prev,
                            [user.address]: e.target.value,
                          }))
                        }
                        placeholder="Rejection reason"
                        className="text-lg text-gray-700 border border-pink-200 rounded-xl p-2 focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all"
                        disabled={loading}
                      />
                      <button
                        onClick={() => rejectUser(user.address)}
                        className="bg-gradient-to-r from-red-500 to-pink-500 text-white text-lg py-2 px-4 rounded-xl hover:from-red-600 hover:to-pink-600 focus:outline-none focus:ring-4 focus:ring-red-400 transition-all duration-300 disabled:opacity-50"
                        disabled={loading}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {status && (
          <p className="text-xl text-gray-700 mt-8 text-center break-words">
            <span className="font-semibold">Status:</span> {status}
          </p>
        )}
      </div>
    </div>
  );
}

export default AdminPage;