import type { Web3Provider } from "@ethersproject/providers";
import { useWeb3React } from "@web3-react/core";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Backdrop from "@mui/material/Backdrop";
import CircularProgress from "@mui/material/CircularProgress";
import { useState, useRef } from "react";
import { doAccountsMatch, getCollectionContract, toBase64 } from "../utils/util";
import { deployedNftMarketplace } from "../utils/deployedContracts";
import useNftMarketplaceContract from "../hooks/useNftMarketplaceContract";
import { formatEtherscanLink, shortenHex } from "../utils/util";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Link from "@mui/material/Link";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MediaCard from "../components/MediaCard";
import nftCollectionFactory from "../contracts/NftCollection.json";
import { NftCollection } from "../contracts/types";
import {
  InfoType,
  Inputs,
  defaultInputs,
  Dialogs,
  defaultDialogs,
  DialogActionTypes,
  DialogToken,
  defaultDialogToken,
  TokensListData,
} from "../utils/types";
import useGraph from "../hooks/useGraph";
import { grey } from "@mui/material/colors";
import Typography from "@mui/material/Typography";
import AccountError from "../components/AccountError";
import { ethers } from "ethers";

const MyTokens = () => {
  const { library, account, chainId } = useWeb3React<Web3Provider>();
  const nftMarketplaceContract = useNftMarketplaceContract(deployedNftMarketplace.address);
  const graphData = useGraph(account, false);

  const [dialogs, setDialogs] = useState<Dialogs>(defaultDialogs);
  const [dialogToken, setDialogToken] = useState<DialogToken>(defaultDialogToken);
  const [transactionInProgress, setTransactionInProgress] = useState<boolean>(false);
  const [info, setInfo] = useState<InfoType>({});
  const [inputs, setInputs] = useState<Inputs>(defaultInputs);
  const tokenImage = useRef(null);

  const inputHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    switch (e.target.name) {
      case "nftName":
        setInputs((inputs) => ({ ...inputs, nftName: e.target.value }));
        break;
      case "nftSymbol":
        setInputs((inputs) => ({ ...inputs, nftSymbol: e.target.value }));
        break;
      case "nftAddress":
        setInputs((inputs) => ({ ...inputs, nftAddress: e.target.value }));
        break;
      case "tokenId":
        setInputs((inputs) => ({ ...inputs, tokenId: e.target.value }));
        break;
      case "price":
        setInputs((inputs) => ({ ...inputs, price: e.target.value }));
        break;
      case "tokenName":
        setInputs((inputs) => ({ ...inputs, tokenName: e.target.value }));
        break;
      case "tokenImage":
        setInputs((inputs) => ({ ...inputs, tokenImage: e.target.files?.[0]?.name || "" }));
        break;
    }
  };

  const handleDialogOpening = (
    action: DialogActionTypes,
    nftAddress?: string,
    tokenId?: string
  ) => {
    // Update info about the token we open the dialog for
    setDialogToken({ nftAddress, tokenId });

    // Update info about which dialog is open
    switch (action) {
      case DialogActionTypes.DEPLOY_COLLECTION:
        setDialogs((prevState) => ({ ...prevState, deployCollection: true }));
        break;
      case DialogActionTypes.MINT_TOKEN:
        setDialogs((prevState) => ({ ...prevState, mintToken: true }));
        break;
      case DialogActionTypes.LIST_ITEM:
        setDialogs((prevState) => ({ ...prevState, listItem: true }));
        break;
      case DialogActionTypes.CANCEL_LISTING:
        setDialogs((prevState) => ({ ...prevState, cancelListing: true }));
        break;
    }
  };

  const closeDialogs = () => {
    // Reset dialogs
    setDialogToken(defaultDialogToken);
    setDialogs(defaultDialogs);
    setInputs(defaultInputs);
  };

  /////////////////////
  //Deploy Collection//
  /////////////////////

  const deployCollection = async () => {
    // Checking user input
    if (!inputs.nftName || !inputs.nftSymbol) {
      setInfo({ error: "Fill out the fields." });
      return;
    }
    setInfo({});
    setTransactionInProgress(true);
    setDialogs(defaultDialogs);
    setInputs(defaultInputs);

    // Preparing the contract
    setInfo({
      info: "Deploying new collection...",
    });
    const signer = library.getSigner(account);
    const Factory = new ethers.ContractFactory(
      nftCollectionFactory.abi,
      nftCollectionFactory.bytecode,
      signer
    );
    console.log("Deploying the contract for the collection");
    const collectionContract = await Factory.deploy(
      inputs.nftName,
      inputs.nftSymbol,
      nftMarketplaceContract.address
    );
    console.log("Deployed, waiting for confirmation");
    await collectionContract.deployed();
    console.log("Collection contract deployed at: ", collectionContract.address);

    // Storing collection address in the marketplace
    try {
      const tx = await nftMarketplaceContract.addCollection(collectionContract.address);
      setInfo({
        info: "Storing collection address in the marketplace...",
        link: formatEtherscanLink("Transaction", [Number(tx.chainId) || chainId, tx.hash]),
        hash: shortenHex(tx.hash),
      });
      await tx.wait();
      setInfo((prevInfo) => ({ ...prevInfo, info: "Transaction completed." }));
    } catch (error) {
      setInfo({ error: error.error?.message || error.errorArgs?.[0] || error.message });
    } finally {
      setTransactionInProgress(false);
      setDialogToken(defaultDialogToken);
    }
  };

  /////////////////////
  //  Mint new token //
  /////////////////////

  const mintToken = async () => {
    // Checking user input
    const image = tokenImage.current?.files?.[0] as File;
    if (!image || !inputs.tokenName) {
      setInfo({ error: "Fill out the fields." });
      return;
    }
    if (image.size > 100 * 1024) {
      setInfo({ error: "Ensure the image is less than 100KB." });
      return;
    }
    setInfo({});
    setTransactionInProgress(true);
    setDialogs(defaultDialogs);
    setInputs(defaultInputs);

    const imageBase64 = await toBase64(image);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBase64,
          tokenName: inputs.tokenName,
        }),
      });

      const { imagePath, metadataPath } = await response.json();

      // Preparing the contract
      const signer = library.getSigner(account);
      const collectionContract = await getCollectionContract(signer, dialogToken.nftAddress, null);

      // Mint
      const tx = await collectionContract.safeMint(account, metadataPath);
      setInfo({
        info: "Transaction pending...",
        link: formatEtherscanLink("Transaction", [Number(tx.chainId) || chainId, tx.hash]),
        hash: shortenHex(tx.hash),
      });
      await tx.wait();
      setInfo((prevInfo) => ({ ...prevInfo, info: "Transaction completed." }));
    } catch (error) {
      setInfo({ error: error.error?.message || error.errorArgs?.[0] || error.message });
    } finally {
      setTransactionInProgress(false);
      setDialogToken(defaultDialogToken);
    }
  };

  /////////////////////
  //     List Item   //
  /////////////////////

  const listItem = async () => {
    // Checking user input
    if (!inputs.price) {
      setInfo({ error: "Fill out the fields." });
      return;
    }
    setInfo({});
    setTransactionInProgress(true);
    setDialogs(defaultDialogs);
    setInputs(defaultInputs);

    try {
      // Preparing the contract
      const signer = library.getSigner(account);
      const collectionContract = await getCollectionContract(signer, dialogToken.nftAddress, null);
      let tx = await collectionContract.approve(
        nftMarketplaceContract.address,
        dialogToken.tokenId
      );
      setInfo({
        info: "Transaction pending...",
        link: formatEtherscanLink("Transaction", [Number(tx.chainId) || chainId, tx.hash]),
        hash: shortenHex(tx.hash),
      });
      await tx.wait();

      // Find out listing fee
      const listingFee = await nftMarketplaceContract.listingFee();

      // List item
      setInfo((prevInfo) => ({ ...prevInfo, info: "Transaction completed." }));
      tx = await nftMarketplaceContract.listItem(
        dialogToken.nftAddress,
        dialogToken.tokenId,
        ethers.utils.parseEther(inputs.price),
        {
          value: listingFee,
        }
      );
      setInfo({
        info: "Transaction pending...",
        link: formatEtherscanLink("Transaction", [Number(tx.chainId) || chainId, tx.hash]),
        hash: shortenHex(tx.hash),
      });
      await tx.wait();
      setInfo((prevInfo) => ({ ...prevInfo, info: "Transaction completed." }));
    } catch (error) {
      setInfo({ error: error.error?.message || error.errorArgs?.[0] || error.message });
    } finally {
      setTransactionInProgress(false);
      setDialogToken(defaultDialogToken);
    }
  };

  /////////////////////
  //  Cancel Listing //
  /////////////////////

  const cancelListing = async () => {
    setInfo({});
    setTransactionInProgress(true);
    setDialogs(defaultDialogs);
    setInputs(defaultInputs);

    try {
      const tx = await nftMarketplaceContract.cancelListing(
        dialogToken.nftAddress,
        dialogToken.tokenId
      );
      setInfo({
        info: "Transaction pending...",
        link: formatEtherscanLink("Transaction", [Number(tx.chainId) || chainId, tx.hash]),
        hash: shortenHex(tx.hash),
      });
      await tx.wait();
      setInfo((prevInfo) => ({ ...prevInfo, info: "Transaction completed." }));
    } catch (error) {
      setInfo({ error: error.error?.message || error.errorArgs?.[0] || error.message });
    } finally {
      setTransactionInProgress(false);
      setDialogToken(defaultDialogToken);
    }
  };

  if (!!account === false) {
    return <AccountError />;
  }

  return (
    <>
      {info.info && !transactionInProgress && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {info.info}{" "}
          {info.link && info.hash && (
            <Link href={info.link} rel="noopener noreferrer" target="_blank">
              {shortenHex(info.hash, 4)}
            </Link>
          )}
        </Alert>
      )}
      {info.error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {info.error}
        </Alert>
      )}
      <Grid container spacing={3}>
        {graphData.error ? (
          <Grid item lg={12}>
            <Alert severity="error" sx={{ mb: 3 }}>
              {graphData.error.message}
            </Alert>
          </Grid>
        ) : !graphData.dataLength ? (
          <Grid item lg={12}>
            <Alert severity="info" sx={{ mb: 3 }}>
              No data yet.
            </Alert>
          </Grid>
        ) : !graphData.collectionsList?.length && !graphData.error ? (
          <CircularProgress color="inherit" sx={{ mb: 3 }} />
        ) : (
          <Grid item lg={12}>
            {graphData.collectionsList?.length > 0 &&
              graphData.collectionsList.map(
                ({ nftAddress, isCollectionOwner, tokens, collectionName }) =>
                  (isCollectionOwner || tokens.some((token) => token.owner === account)) && (
                    <Paper
                      key={shortenHex(nftAddress)}
                      sx={{ padding: 3, mb: 3, backgroundColor: grey[50] }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <h3>Collection: {collectionName}</h3>
                        {isCollectionOwner && (
                          <Button
                            variant="outlined"
                            onClick={handleDialogOpening.bind(
                              this,
                              DialogActionTypes.MINT_TOKEN,
                              nftAddress
                            )}
                            disabled={transactionInProgress}
                          >
                            Mint new token
                          </Button>
                        )}
                      </Box>
                      {tokens.length === 0 ||
                      !tokens.some(
                        (token: TokensListData) =>
                          token.owner && doAccountsMatch(token.owner, account)
                      ) ? (
                        <Typography variant="body1" component="div">
                          You do not own any tokens from this collection, but the collection is
                          yours, so you can mint a new token.
                        </Typography>
                      ) : (
                        <Grid container spacing={3}>
                          {tokens.map(
                            (token: TokensListData, index2: number) =>
                              token.owner &&
                              doAccountsMatch(token.owner, account) && (
                                <Grid item lg={3} key={index2}>
                                  <MediaCard
                                    tokenData={token}
                                    transactionInProgress={transactionInProgress}
                                    handleDialogOpening={handleDialogOpening}
                                  ></MediaCard>
                                </Grid>
                              )
                          )}
                        </Grid>
                      )}
                    </Paper>
                  )
              )}
          </Grid>
        )}
        <Grid item lg={3}>
          <Button
            variant="contained"
            onClick={handleDialogOpening.bind(this, DialogActionTypes.DEPLOY_COLLECTION)}
            disabled={transactionInProgress}
          >
            Deploy a new collection
          </Button>
        </Grid>
      </Grid>
      <Dialog open={dialogs.deployCollection} onClose={closeDialogs}>
        <DialogTitle>Deploy collection</DialogTitle>
        <DialogContent>
          <DialogContentText>Set the details for your new collection.</DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            name="nftName"
            label="NFT Name"
            type="text"
            fullWidth
            variant="standard"
            onChange={inputHandler}
            value={inputs.nftName}
            disabled={transactionInProgress}
          />
          <TextField
            margin="dense"
            name="nftSymbol"
            label="NFT Symbol"
            type="text"
            fullWidth
            variant="standard"
            onChange={inputHandler}
            value={inputs.nftSymbol}
            disabled={transactionInProgress}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs}>Cancel</Button>
          <Button onClick={deployCollection}>Deploy</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={dialogs.mintToken} onClose={closeDialogs}>
        <DialogTitle>Mint token</DialogTitle>
        <DialogContent>
          <DialogContentText>What token would you like to mint?</DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            name="tokenName"
            label="Token Name"
            type="text"
            fullWidth
            variant="standard"
            onChange={inputHandler}
            value={inputs.tokenName}
            disabled={transactionInProgress}
          />
          <label htmlFor="tokenImage">
            <input
              ref={tokenImage}
              id="tokenImage"
              name="tokenImage"
              style={{ visibility: "hidden", height: 0, width: 0 }}
              type="file"
              accept="image/*"
              onChange={inputHandler}
              disabled={transactionInProgress}
            />
            <Button
              variant="outlined"
              component="span"
              sx={{ mt: 2, width: "100%" }}
              disabled={transactionInProgress}
            >
              {inputs.tokenImage ? inputs.tokenImage : "Choose Image"}
            </Button>
          </label>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs}>Cancel</Button>
          <Button onClick={mintToken}>Mint</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={dialogs.listItem} onClose={closeDialogs}>
        <DialogTitle>List token</DialogTitle>
        <DialogContent>
          <DialogContentText>Which price do you want to sell the token for?</DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            name="price"
            label="Price"
            type="number"
            fullWidth
            variant="standard"
            onChange={inputHandler}
            value={inputs.price}
            disabled={transactionInProgress}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs}>Cancel</Button>
          <Button onClick={listItem}>List Item</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={dialogs.cancelListing} onClose={closeDialogs}>
        <DialogTitle>Cancel listing</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Do you want to remove the token from the marketplace?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs}>Disagree</Button>
          <Button onClick={cancelListing} autoFocus>
            Agree
          </Button>
        </DialogActions>
      </Dialog>
      <Backdrop
        sx={{ color: "#fff", flexDirection: "column", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={transactionInProgress}
      >
        <CircularProgress color="inherit" sx={{ mb: 3 }} />
        {info.info && (
          <Alert severity="info">
            {info.info}{" "}
            {info.link && info.hash && (
              <Link href={info.link} rel="noopener noreferrer" target="_blank">
                {shortenHex(info.hash)}
              </Link>
            )}
          </Alert>
        )}
      </Backdrop>
    </>
  );
};

export default MyTokens;
